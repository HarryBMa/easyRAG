import postgres from 'postgres'

const DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10)

let connection: postgres.Sql | null = null

function getConnection(): postgres.Sql {
  if (!connection) {
    connection = postgres(process.env.DATABASE_URL!)
  }
  return connection
}

export async function ensureCollection(): Promise<void> {
  const sql = getConnection()
  await sql`CREATE EXTENSION IF NOT EXISTS vector`
  await sql`
    CREATE TABLE IF NOT EXISTS protocol_chunks (
      id           TEXT PRIMARY KEY,
      guideline_id TEXT NOT NULL,
      entity_type  TEXT NOT NULL,
      content      TEXT NOT NULL,
      chunk_index  INTEGER NOT NULL,
      embedding    vector(${sql.unsafe(String(DIM))})
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS protocol_chunks_embedding_idx
    ON protocol_chunks USING hnsw (embedding vector_cosine_ops)
  `
}

export interface ChunkEntity {
  id: string
  guideline_id: string
  entity_type: string
  content: string
  chunk_index: number
  embedding: number[]
}

export async function upsertChunks(entities: ChunkEntity[]): Promise<void> {
  if (!entities.length) return
  const sql = getConnection()
  for (const e of entities) {
    const vec = `[${e.embedding.join(',')}]`
    await sql`
      INSERT INTO protocol_chunks (id, guideline_id, entity_type, content, chunk_index, embedding)
      VALUES (${e.id}, ${e.guideline_id}, ${e.entity_type}, ${e.content}, ${e.chunk_index}, ${vec}::vector)
      ON CONFLICT (id) DO UPDATE
        SET content = EXCLUDED.content,
            embedding = EXCLUDED.embedding
    `
  }
}

export async function searchSimilar(
  embedding: number[],
  limit = 6,
  filter?: string,
): Promise<{ guideline_id: string; content: string; score: number }[]> {
  const sql = getConnection()
  const vec = `[${embedding.join(',')}]`

  let rows: { guideline_id: string; content: string; score: number }[]

  if (filter) {
    // filter is a guideline_id IN list expressed as comma-separated quoted ids
    // e.g. `guideline_id in ["id1","id2"]` — parse to extract ids
    const match = filter.match(/guideline_id\s+in\s+\[([^\]]+)\]/i)
    if (match) {
      const ids = match[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
      rows = await sql`
        SELECT guideline_id, content,
               1 - (embedding <=> ${vec}::vector) AS score
        FROM protocol_chunks
        WHERE guideline_id = ANY(${ids})
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${limit}
      `
    } else {
      rows = await sql`
        SELECT guideline_id, content,
               1 - (embedding <=> ${vec}::vector) AS score
        FROM protocol_chunks
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${limit}
      `
    }
  } else {
    rows = await sql`
      SELECT guideline_id, content,
             1 - (embedding <=> ${vec}::vector) AS score
      FROM protocol_chunks
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `
  }

  return rows
}

export async function deleteByGuideline(guidelineId: string): Promise<void> {
  const sql = getConnection()
  await sql`DELETE FROM protocol_chunks WHERE guideline_id = ${guidelineId}`
}
