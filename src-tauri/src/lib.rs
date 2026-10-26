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
        let modified = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        let rel = full.strip_prefix(&root).unwrap_or(full).to_string_lossy().to_string();
        let filename = full.file_name().unwrap_or_default().to_string_lossy().to_string();
        let extension = full.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
        let folder_name = full.parent().and_then(Path::file_name).unwrap_or(root.as_os_str()).to_string_lossy().to_string();
        output.push(MediaFile {
            path: full.to_string_lossy().to_string(), relative_path: rel,
            filename, extension, kind: kind.into(), size: metadata.len(),
            modified_at: modified.to_string(), folder_name,
        });
    }
    output.sort_by(|a,b| b.modified_at.cmp(&a.modified_at));
    Ok(output)
}

#[tauri::command]
fn path_exists(path: String) -> bool { Path::new(&path).is_file() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![scan_folder, path_exists])
        .run(tauri::generate_context!())
        .expect("运行漫游时发生错误");
}
