import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dataDir = join(process.cwd(), 'data')
  mkdirSync(dataDir, { recursive: true })

  db = new Database(join(dataDir, 'easyrag.db'))
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      category  TEXT DEFAULT 'uncategorized',
      status    TEXT DEFAULT 'processing',
      chunk_count INTEGER DEFAULT 0,
      file_size INTEGER,
      mime_type TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `)

  return db
}
