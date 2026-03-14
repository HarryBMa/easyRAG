import postgres from 'postgres'

let connection: postgres.Sql | null = null

function getConnection(): postgres.Sql {
  if (!connection) {
    connection = postgres(process.env.DATABASE_URL!)
  }
  return connection
}

/** Convert SQLite `?` placeholders to Postgres `$n` positional params */
function toPositional(sqlStr: string, args: unknown[]): [string, unknown[]] {
  let i = 0
  const pgSql = sqlStr.replace(/\?/g, () => `$${++i}`)
  return [pgSql, args]
}

interface DbResult {
  rows: Record<string, unknown>[]
}

class Client {
  async execute(
    query: string | { sql: string; args: unknown[] },
  ): Promise<DbResult> {
    const sql = getConnection()
    if (typeof query === 'string') {
      const rows = await sql.unsafe(query)
      return { rows: rows as unknown as Record<string, unknown>[] }
    }
    const [pgSql, pgArgs] = toPositional(query.sql, query.args as unknown[])
    const rows = await sql.unsafe(pgSql, pgArgs as postgres.ParameterOrJSON<never>[])
    return { rows: rows as unknown as Record<string, unknown>[] }
  }

  async batch(queries: { sql: string; args: unknown[] }[]): Promise<void> {
    const sql = getConnection()
    await sql.begin(async (tx) => {
      for (const q of queries) {
        const [pgSql, pgArgs] = toPositional(q.sql, q.args as unknown[])
        await tx.unsafe(pgSql, pgArgs as postgres.ParameterOrJSON<never>[])
      }
    })
  }
}

let client: Client | null = null

export function getDb(): Client {
  if (!client) client = new Client()
  return client
}

export async function initDb(): Promise<void> {
  const sql = getConnection()

  await sql`
    CREATE TABLE IF NOT EXISTS guidelines (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      hospital         TEXT,
      category         TEXT NOT NULL DEFAULT 'general',
      raw_text         TEXT,
      structured_json  TEXT,
      confidence_score REAL DEFAULT 0.0,
      source_quality   REAL DEFAULT 0.0,
      status           TEXT DEFAULT 'active',
      upvotes          INTEGER DEFAULT 0,
      downvotes        INTEGER DEFAULT 0,
      pubmed_count     INTEGER DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS tricks (
      id                    TEXT PRIMARY KEY,
      content               TEXT NOT NULL,
      author                TEXT,
      hospital              TEXT,
      category              TEXT DEFAULT 'general',
      upvotes               INTEGER DEFAULT 0,
      downvotes             INTEGER DEFAULT 0,
      hospital_count        INTEGER DEFAULT 1,
      study_count           INTEGER DEFAULT 0,
      badges                TEXT DEFAULT '[]',
      related_guideline_ids TEXT DEFAULT '[]',
      created_at            TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
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
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id          TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      vote_type   TEXT NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (entity_type, entity_id, user_id)
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_guidelines_status   ON guidelines (status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_guidelines_category ON guidelines (category)`
  await sql`CREATE INDEX IF NOT EXISTS idx_tricks_category     ON tricks (category)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sources_guideline   ON sources (guideline_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_votes_entity        ON votes (entity_type, entity_id)`
}
