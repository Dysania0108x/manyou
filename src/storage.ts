import Database from '@tauri-apps/plugin-sql';
import type { MediaItem, ManyouState, SourceRoot } from './types';

let db: Database | null = null;
export async function openStore() {
  db = await Database.load('sqlite:manyou.db');
  await db.execute('CREATE TABLE IF NOT EXISTS source_roots (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, last_scanned_at TEXT, created_at TEXT NOT NULL)');
  await db.execute('CREATE TABLE IF NOT EXISTS media_items (id TEXT PRIMARY KEY, root_id TEXT NOT NULL, path TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL, filename TEXT NOT NULL, extension TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, modified_at TEXT NOT NULL, folder_name TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0, online INTEGER NOT NULL DEFAULT 1)');
  return db;
}
export async function loadRoots(): Promise<SourceRoot[]> {
  if(!db) await openStore();
  const rows=await db!.select<any[]>('SELECT * FROM source_roots ORDER BY created_at');
  return rows.map(r=>({id:r.id,path:r.path,displayName:r.display_name,lastScannedAt:r.last_scanned_at||undefined,createdAt:r.created_at}));
}
export async function loadMedia(): Promise<MediaItem[]> {
  if(!db) await openStore();
  const rows=await db!.select<any[]>('SELECT * FROM media_items');
  return rows.map(r=>({id:r.id,rootId:r.root_id,path:r.path,relativePath:r.relative_path,filename:r.filename,extension:r.extension,kind:r.kind,size:r.size,modifiedAt:r.modified_at,createdAt:r.modified_at,favorite:Boolean(r.favorite),online:Boolean(r.online),folderName:r.folder_name}));
}
export async function addRoot(root:SourceRoot) {
  if(!db) await openStore();
  await db!.execute('INSERT OR IGNORE INTO source_roots (id,path,display_name,created_at) VALUES ($1,$2,$3,$4)',[root.id,root.path,root.displayName,root.createdAt]);
}
export async function replaceScannedFiles(root:SourceRoot,items:MediaItem[]) {
  if(!db) await openStore();
  await db!.execute('UPDATE source_roots SET last_scanned_at=$1 WHERE id=$2',[new Date().toISOString(),root.id]);
  const existing=await db!.select<any[]>('SELECT path,favorite FROM media_items WHERE root_id=$1',[root.id]);
  const favorites=new Map<string,boolean>(existing.map(r=>[r.path,Boolean(r.favorite)]));
  for(const item of items){
    await db!.execute('INSERT INTO media_items (id,root_id,path,relative_path,filename,extension,kind,size,modified_at,folder_name,favorite,online) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1) ON CONFLICT(path) DO UPDATE SET relative_path=excluded.relative_path,filename=excluded.filename,extension=excluded.extension,kind=excluded.kind,size=excluded.size,modified_at=excluded.modified_at,folder_name=excluded.folder_name,online=1',[item.id,item.rootId,item.path,item.relativePath,item.filename,item.extension,item.kind,item.size,item.modifiedAt,item.folderName,favorites.get(item.path)?1:0]);
  }
  const scannedPaths=new Set(items.map(i=>i.path));
  for(const row of existing){ if(!scannedPaths.has(row.path)) await db!.execute('UPDATE media_items SET online=0 WHERE path=$1',[row.path]); }

}
export async function toggleFavorite(item:MediaItem) {
  if(!db) await openStore();
  const next=!item.favorite;
  await db!.execute('UPDATE media_items SET favorite=$1 WHERE path=$2',[next?1:0,item.path]);
  return next;
}
export async function updateRootName(id:string,name:string) {
  if(!db) await openStore();
  await db!.execute('UPDATE source_roots SET display_name=$1 WHERE id=$2',[name,id]);
}
export async function removeRoot(id:string) {
  if(!db) await openStore();
  await db!.execute('DELETE FROM media_items WHERE root_id=$1',[id]);
  await db!.execute('DELETE FROM source_roots WHERE id=$1',[id]);
}
export type { ManyouState };
