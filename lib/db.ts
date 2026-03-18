import postgres from 'postgres'

let connection: postgres.Sql | null = null

export function getSql(): postgres.Sql {
  if (!connection) {
    connection = postgres(process.env.DATABASE_URL!)
  }
  return connection
}

export async function getDb() {
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      category    TEXT DEFAULT 'uncategorized',
      status      TEXT DEFAULT 'processing',
      chunk_count INTEGER DEFAULT 0,
      file_size   INTEGER,
      mime_type   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  return sql
}
