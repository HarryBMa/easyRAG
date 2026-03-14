import { createClient, type Client } from '@libsql/client'
import { mkdirSync } from 'fs'
import { join } from 'path'

let client: Client | null = null

export function getDb(): Client {
  if (client) return client

  const url = process.env.TURSO_DATABASE_URL ?? 'file:data/protocolsync.db'
  if (url.startsWith('file:')) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
  }

  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  return client
}

export async function initDb(): Promise<void> {
  const db = getDb()

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS guidelines (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      hospital        TEXT,
      category        TEXT NOT NULL DEFAULT 'general',
      raw_text        TEXT,
      structured_json TEXT,
      confidence_score REAL DEFAULT 0.0,
      source_quality  REAL DEFAULT 0.0,
      status          TEXT DEFAULT 'active',
      upvotes         INTEGER DEFAULT 0,
      downvotes       INTEGER DEFAULT 0,
      pubmed_count    INTEGER DEFAULT 0,
      created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tricks (
      id                   TEXT PRIMARY KEY,
      content              TEXT NOT NULL,
      author               TEXT,
      hospital             TEXT,
      category             TEXT DEFAULT 'general',
      upvotes              INTEGER DEFAULT 0,
      downvotes            INTEGER DEFAULT 0,
      hospital_count       INTEGER DEFAULT 1,
      study_count          INTEGER DEFAULT 0,
      badges               TEXT DEFAULT '[]',
      related_guideline_ids TEXT DEFAULT '[]',
      created_at           TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sources (
      id              TEXT PRIMARY KEY,
      guideline_id    TEXT NOT NULL,
      pubmed_id       TEXT,
      title           TEXT,
      authors         TEXT,
      journal         TEXT,
      year            INTEGER,
      relevance_score REAL,
      url             TEXT
    );

    CREATE TABLE IF NOT EXISTS votes (
      id          TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      vote_type   TEXT NOT NULL,
      created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(entity_type, entity_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_guidelines_status   ON guidelines(status);
    CREATE INDEX IF NOT EXISTS idx_guidelines_category ON guidelines(category);
    CREATE INDEX IF NOT EXISTS idx_tricks_category     ON tricks(category);
    CREATE INDEX IF NOT EXISTS idx_sources_guideline   ON sources(guideline_id);
    CREATE INDEX IF NOT EXISTS idx_votes_entity        ON votes(entity_type, entity_id);
  `)
}
