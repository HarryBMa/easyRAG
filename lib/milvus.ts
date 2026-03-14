import postgres from 'postgres'
import { leannIndex } from './leann'

const DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10)

let connection: postgres.Sql | null = null
let leannLoaded = false

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
    // Keep LEANN index in sync
    leannIndex.add(e.id, e.embedding)
  }
}

/**
 * Populate the in-memory LEANN index from pgvector on first use.
 * Subsequent calls are no-ops once loaded.
 */
async function maybeLoadLeann(): Promise<void> {
  if (leannLoaded || leannIndex.ready) return
  leannLoaded = true // set early to avoid concurrent loads

  try {
    const sql = getConnection()
    const rows = await sql<{ id: string; embedding: string }[]>`
      SELECT id, embedding::text FROM protocol_chunks
    `
    for (const row of rows) {
      // embedding arrives as "[0.1,0.2,...]" string
      const vec = JSON.parse(row.embedding) as number[]
      leannIndex.add(row.id, vec)
    }
  } catch (err) {
    leannLoaded = false // allow retry next time
    console.warn('[leann] index load failed:', (err as Error).message)
  }
}

export async function searchSimilar(
  embedding: number[],
  limit = 6,
  filter?: string,
): Promise<{ guideline_id: string; content: string; score: number }[]> {
  const sql = getConnection()
  const vec = `[${embedding.join(',')}]`

  // Parse optional guideline filter
  let filterIds: string[] | null = null
  if (filter) {
    const match = filter.match(/guideline_id\s+in\s+\[([^\]]+)\]/i)
    if (match) {
      filterIds = match[1].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    }
  }

  // --- Fast path: LEANN in-memory HNSW ---
  await maybeLoadLeann()

  if (leannIndex.ready) {
    // Over-fetch candidates to allow for post-filter & scoring
    const candidates = leannIndex.search(embedding, limit * 3)
    const candidateIds = candidates.map((c) => c.chunkId)

    // Fetch full rows for candidates (indexed PK lookup — very fast)
    let rows: { guideline_id: string; content: string; score: number }[]

    if (filterIds) {
      rows = await sql<{ guideline_id: string; content: string; score: number }[]>`
        SELECT guideline_id, content,
               1 - (embedding <=> ${vec}::vector) AS score
        FROM protocol_chunks
        WHERE id = ANY(${candidateIds})
          AND guideline_id = ANY(${filterIds})
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${limit}
      `
    } else {
      rows = await sql<{ guideline_id: string; content: string; score: number }[]>`
        SELECT guideline_id, content,
               1 - (embedding <=> ${vec}::vector) AS score
        FROM protocol_chunks
        WHERE id = ANY(${candidateIds})
        ORDER BY embedding <=> ${vec}::vector
        LIMIT ${limit}
      `
    }

    if (rows.length > 0) return rows
    // If candidates returned nothing (e.g. filter too restrictive), fall through
  }

  // --- Fallback: full pgvector HNSW scan ---
  if (filterIds) {
    return sql<{ guideline_id: string; content: string; score: number }[]>`
      SELECT guideline_id, content,
             1 - (embedding <=> ${vec}::vector) AS score
      FROM protocol_chunks
      WHERE guideline_id = ANY(${filterIds})
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${limit}
    `
  }

  return sql<{ guideline_id: string; content: string; score: number }[]>`
    SELECT guideline_id, content,
           1 - (embedding <=> ${vec}::vector) AS score
    FROM protocol_chunks
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${limit}
  `
}

export async function deleteByGuideline(guidelineId: string): Promise<void> {
  const sql = getConnection()
  await sql`DELETE FROM protocol_chunks WHERE guideline_id = ${guidelineId}`
  // Note: LEANN index does not support deletion; it will still return stale
  // entries but pgvector will filter them out on the PK lookup above.
}
