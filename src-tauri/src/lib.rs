use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub path: String,
    pub relative_path: String,
    pub filename: String,
    pub extension: String,
    pub kind: String,
    pub size: u64,
    pub modified_at: String,
    pub folder_name: String,
}

fn supported_kind(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "heic" | "heif" | "webp" | "tif" | "tiff" | "gif" | "bmp" | "avif" => Some("image"),
        "mov" | "mp4" | "m4v" | "avi" | "mkv" | "webm" => Some("video"),
        _ => None,
    }
}

fn timestamp_string(path: &Path) -> String {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|| "0".into())
}

#[tauri::command]
fn scan_folder(path: String) -> Result<Vec<MediaFile>, String> {
    let root = PathBuf::from(&path);
    if !root.exists() { return Err("这个文件夹当前不可用。".into()); }
    if !root.is_dir() { return Err("请选择一个文件夹。".into()); }

    let mut output = Vec::new();
    for item in WalkDir::new(&root).follow_links(false).into_iter().filter_map(Result::ok) {
        if !item.file_type().is_file() { continue; }
        let full = item.path();
        let Some(kind) = supported_kind(full) else { continue; };
        let metadata = match std::fs::metadata(full) { Ok(m) => m, Err(_) => continue };
        let rel = full.strip_prefix(&root).unwrap_or(full).to_string_lossy().to_string();
        let filename = full.file_name().unwrap_or_default().to_string_lossy().to_string();
        let extension = full.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
        let folder_name = full.parent().and_then(Path::file_name).unwrap_or(root.as_os_str()).to_string_lossy().to_string();
        output.push(MediaFile {
            path: full.to_string_lossy().to_string(),
            relative_path: rel,
            filename,
            extension,
            kind: kind.into(),
            size: metadata.len(),
            modified_at: timestamp_string(full),
            folder_name,
        });
    }
    output.sort_by(|a,b| b.modified_at.cmp(&a.modified_at));
    Ok(output)
}

#[tauri::command]
fn path_exists(path: String) -> bool { Path::new(&path).is_file() }

use base64::Engine;

#[tauri::command]
fn save_postcard_png(path: String, data_url: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("png")) != Some(true) {
        return Err("只能保存 PNG 文件".into());
    }
    let encoded = data_url.strip_prefix("data:image/png;base64,")
        .ok_or("无效的 PNG 数据")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 40_000_000 || !bytes.starts_with(b"\\x89PNG\\r\\n\\x1a\\n") {
        return Err("图片数据无效或过大".into());
    }
    std::fs::write(target, bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![scan_folder, path_exists, save_postcard_png])
        .run(tauri::generate_context!())
        .expect("运行漫游时发生错误");
}
