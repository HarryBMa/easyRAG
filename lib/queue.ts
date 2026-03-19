/**
 * Background processing queue — persisted in Postgres.
 *
 * Flow:
 *   enqueue(file) → INSERT into processing_queue → ensureWorker()
 *   Worker polls every POLL_MS, claims one pending job, runs the full
 *   OCR → MedGemma → embed → pgvector pipeline, then marks done/failed.
 *   Failed jobs are retried up to MAX_ATTEMPTS times before being marked
 *   permanently failed.
 *
 * Single-process safe: the `started` flag ensures only one worker loop
 * runs per Node.js process. For multi-instance deployments, replace the
 * status UPDATE with `SELECT ... FOR UPDATE SKIP LOCKED`.
 */

import { randomUUID } from 'crypto'
import { getDb } from './turso'
import { extractText } from './ocr'
import { structureGuideline } from './medllm'
import { evaluateGuideline } from './scoring'
import { embedBatch, chunkText } from './embed'
import { ensureCollection, upsertChunks } from './milvus'

const POLL_MS = 5_000
const MAX_ATTEMPTS = 3

let started = false

// ── Public interface ──────────────────────────────────────────────────────────

/** Add a file to the processing queue. Returns the queue job ID. */
export async function enqueue(file: File, hospital?: string): Promise<string> {
  const db = getDb()
  const id = randomUUID()
  const buffer = Buffer.from(await file.arrayBuffer())

  await db.execute({
    sql: `INSERT INTO processing_queue (id, filename, file_data, file_mime, hospital)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, file.name, buffer, file.type || 'application/octet-stream', hospital ?? null],
  })

  ensureWorker()
  return id
}

/** Aggregated queue stats + recent jobs for the UI. */
export async function getQueueStats(): Promise<QueueStats> {
  const db = getDb()

  const { rows: counts } = await db.execute(
    `SELECT status, COUNT(*)::int AS count FROM processing_queue GROUP BY status`,
  )
  const { rows: recent } = await db.execute(
    `SELECT id, filename, status, attempts, error,
            created_at::text, started_at::text, completed_at::text
     FROM processing_queue
     ORDER BY created_at DESC
     LIMIT 20`,
  )

  const byStatus = Object.fromEntries(
    (counts as { status: string; count: number }[]).map(r => [r.status, r.count]),
  )

  return {
    pending:    byStatus.pending    ?? 0,
    processing: byStatus.processing ?? 0,
    done:       byStatus.done       ?? 0,
    failed:     byStatus.failed     ?? 0,
    recent:     recent as unknown as QueueRow[],
  }
}

/** Start the background worker (no-op if already running). */
export function ensureWorker(): void {
  if (started) return
  started = true
  setImmediate(loop)
}

// ── Worker loop ───────────────────────────────────────────────────────────────

async function loop(): Promise<void> {
  while (true) {
    try {
      await tick()
    } catch (err) {
      console.error('[queue] worker crash:', err)
    }
    await sleep(POLL_MS)
  }
}

async function tick(): Promise<void> {
  const db = getDb()

  // Claim the oldest pending job that hasn't exceeded MAX_ATTEMPTS
  const { rows } = await db.execute(
    `SELECT id, filename, file_data, file_mime, hospital, attempts
     FROM processing_queue
     WHERE status = 'pending' AND attempts < ${MAX_ATTEMPTS}
     ORDER BY created_at ASC
     LIMIT 1`,
  )
  if (!rows.length) return

  const job = rows[0] as unknown as RawJob

  await db.execute({
    sql: `UPDATE processing_queue
          SET status = 'processing', started_at = NOW(), attempts = attempts + 1
          WHERE id = ?`,
    args: [job.id],
  })

  console.log(`[queue] 🔄 "${job.filename}" (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`)

  try {
    await runPipeline(job)
    await db.execute({
      sql: `UPDATE processing_queue SET status = 'done', completed_at = NOW() WHERE id = ?`,
      args: [job.id],
    })
    console.log(`[queue] ✅ "${job.filename}" done`)
  } catch (err) {
    const nextAttempts = job.attempts + 1
    const permanent = nextAttempts >= MAX_ATTEMPTS
    await db.execute({
      sql: `UPDATE processing_queue
            SET status = ?, error = ?,
                completed_at = CASE WHEN ? THEN NOW() ELSE NULL END
            WHERE id = ?`,
      args: [permanent ? 'failed' : 'pending', (err as Error).message, permanent, job.id],
    })
    console.error(
      `[queue] ❌ "${job.filename}" ${permanent ? 'permanently failed' : 'will retry'}:`,
      (err as Error).message,
    )
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline(job: RawJob): Promise<void> {
  const buffer = Buffer.from(job.file_data)
  const file = new File([buffer], job.filename, { type: job.file_mime })
  const hospital = job.hospital ?? undefined

  await ensureCollection()
  const db = getDb()

  // 1. OCR
  const rawText = await extractText(file)
  console.log(`[queue] 📄 OCR — ${rawText.length} chars`)

  // 2. Split into protocol sections
  const sections = splitIntoSections(rawText)
  const toProcess = sections.slice(0, 12)
  console.log(`[queue] 📑 ${sections.length} sections, processing ${toProcess.length}`)

  // 3. MedGemma + embed per section
  let saved = 0
  for (const [i, section] of toProcess.entries()) {
    try {
      const structured = await structureGuideline(section, job.filename)
      const { status, reasons } = evaluateGuideline({
        confidenceScore: structured.confidence_score,
        sourceQuality: structured.source_quality,
        rawText: section,
      })

      const guidelineId = randomUUID()
      await db.execute({
        sql: `INSERT INTO guidelines
              (id, title, hospital, category, raw_text, structured_json,
               confidence_score, source_quality, status, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        args: [
          guidelineId,
          structured.title,
          hospital ?? null,
          structured.category,
          section,
          JSON.stringify({ ...structured, flag_reasons: reasons }),
          structured.confidence_score,
          structured.source_quality,
          status,
        ],
      })

      const chunks = chunkText(section)
      const embeddings = await embedBatch(chunks)
      await upsertChunks(
        chunks.map((content, ci) => ({
          id: `${guidelineId}-${ci}`,
          guideline_id: guidelineId,
          entity_type: 'guideline',
          content,
          chunk_index: ci,
          embedding: embeddings[ci],
        })),
      )

      console.log(`[queue] ✅ section ${i + 1}/${toProcess.length} — "${structured.title}"`)
      saved++
    } catch (err) {
      console.warn(`[queue] ⚠️ section ${i + 1} failed:`, (err as Error).message)
    }
  }

  if (saved === 0) throw new Error('All sections failed to process')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitIntoSections(text: string, maxChars = 3000): string[] {
  const parts = text.split(/\n(?=#{1,3} |\n[A-ZÅÄÖ][A-ZÅÄÖ\s\-\/]{8,}\n)/)
  const sections: string[] = []
  let current = ''

  for (const part of parts) {
    if ((current + part).length > maxChars && current.length > 200) {
      sections.push(current.trim())
      current = part
    } else {
      current += '\n' + part
    }
  }
  if (current.trim().length > 200) sections.push(current.trim())

  if (sections.length <= 1) {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += maxChars) {
      const chunk = text.slice(i, i + maxChars).trim()
      if (chunk.length > 200) chunks.push(chunk)
    }
    return chunks.length ? chunks : [text]
  }

  return sections
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawJob {
  id: string
  filename: string
  file_data: Uint8Array | Buffer
  file_mime: string
  hospital: string | null
  attempts: number
}

export interface QueueRow {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  attempts: number
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface QueueStats {
  pending: number
  processing: number
  done: number
  failed: number
  recent: QueueRow[]
}
