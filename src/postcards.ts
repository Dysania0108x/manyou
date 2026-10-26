import Database from '@tauri-apps/plugin-sql';

export type PostcardLayout = 'full' | 'gallery' | 'archive';
export type Postcard = {
  id: string;
  photoPath: string;
  layout: PostcardLayout;
  backStyle?: 'letter' | 'map';
  message: string;
  location: string;
  dateLabel: string;
  createdAt: string;
  updatedAt: string;
};
let database: Database | null = null;
async function getDb() {
  if (!database) database = await Database.load('sqlite:manyou.db');
  await database.execute(`CREATE TABLE IF NOT EXISTS postcards (
    id TEXT PRIMARY KEY,
    photo_path TEXT NOT NULL,
    layout TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    date_label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const cols=await database.select<Array<{name:string}>>('PRAGMA table_info(postcards)');
  if(!cols.some(c=>c.name==='back_style'))await database.execute("ALTER TABLE postcards ADD COLUMN back_style TEXT NOT NULL DEFAULT 'letter'");
  return database;
}
export async function loadPostcards(): Promise<Postcard[]> {
  const db = await getDb();
  const rows = await db.select<Array<{
    id:string;photo_path:string;layout:PostcardLayout;message:string;location:string;
    date_label:string;created_at:string;updated_at:string;
  }>>('SELECT * FROM postcards ORDER BY updated_at DESC');
  return rows.map(r=>({id:r.id,photoPath:r.photo_path,layout:r.layout,message:r.message,
    location:r.location,dateLabel:r.date_label,createdAt:r.created_at,updatedAt:r.updated_at}));
}
export async function savePostcard(card:Postcard) {
  const db=await getDb();
  await db.execute(`INSERT INTO postcards
    (id,photo_path,layout,message,location,date_label,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(id) DO UPDATE SET
    photo_path=excluded.photo_path,layout=excluded.layout,message=excluded.message,
    location=excluded.location,date_label=excluded.date_label,updated_at=excluded.updated_at`,
    [card.id,card.photoPath,card.layout,card.message,card.location,card.dateLabel,card.createdAt,card.updatedAt]);
}
export async function deletePostcard(id:string) {
  const db=await getDb();
  await db.execute('DELETE FROM postcards WHERE id=$1',[id]);
}
