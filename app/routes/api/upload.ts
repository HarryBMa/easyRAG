import { createAPIFileRoute } from '@tanstack/react-start/api'
import { randomUUID } from 'crypto'
import { getDb, initDb } from '../../../lib/turso'
import { extractText } from '../../../lib/ocr'
import { structureGuideline } from '../../../lib/medllm'
import { evaluateGuideline } from '../../../lib/scoring'
import { ensureCollection, upsertChunks } from '../../../lib/milvus'
import { chunkText, embedBatch } from '../../../lib/embed'

export const APIRoute = createAPIFileRoute('/api/upload')({
  POST: async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file')
    const hospital = (formData.get('hospital') as string) || undefined

    if (!(file instanceof File)) {
      return json({ error: 'No file provided' }, 400)
    }

    await initDb()
    const db = getDb()
    const docId = randomUUID()

    await db.execute({
      sql: `INSERT INTO guidelines (id, title, hospital, status) VALUES (?, ?, ?, 'processing')`,
      args: [docId, file.name, hospital ?? null],
    })

    // Process async — return 202 immediately so UI can poll
    processGuideline(docId, file, hospital).catch(async (err) => {
      console.error('[upload] processing failed:', err)
      await db.execute({
        sql: `UPDATE guidelines SET status = 'error' WHERE id = ?`,
        args: [docId],
      })
    })

    return json({ id: docId, name: file.name, status: 'processing' }, 202)
  },
})

async function processGuideline(
  docId: string,
  file: File,
  hospital?: string,
) {
  const db = getDb()

  // 1. OCR / text extraction
  const rawText = await extractText(file)

  // 2. LLM structuring (MedGemma via Ollama)
  const structured = await structureGuideline(rawText, file.name)

  // 3. Confidence / trash detection
  const { status, reasons } = evaluateGuideline({
    confidenceScore: structured.confidence_score,
    sourceQuality: structured.source_quality,
    rawText,
  })

  // 4. Persist to Turso
  await db.execute({
    sql: `UPDATE guidelines
          SET title = ?, hospital = ?, category = ?, raw_text = ?,
              structured_json = ?, confidence_score = ?, source_quality = ?,
              status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ?`,
    args: [
      structured.title,
      hospital ?? null,
      structured.category,
      rawText,
      JSON.stringify({ ...structured, flag_reasons: reasons }),
      structured.confidence_score,
      structured.source_quality,
      status,
      docId,
    ],
  })

  // 5. Embed + index chunks in Milvus (best-effort)
  try {
    const chunks = chunkText(rawText)
    await ensureCollection()
    const embeddings = await embedBatch(chunks)
    await upsertChunks(
      chunks.map((content, i) => ({
        id: `${docId}_${i}`,
        guideline_id: docId,
        entity_type: 'guideline',
        content,
        chunk_index: i,
        embedding: embeddings[i],
      })),
    )
  } catch (err) {
    console.warn('[upload] Milvus indexing skipped:', (err as Error).message)
  }

  // 6. Trigger PubMed verification via Supabase Edge (best-effort)
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  if (supabaseUrl && supabaseKey) {
    fetch(`${supabaseUrl}/functions/v1/verify-sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        guideline_id: docId,
        title: structured.title,
        drugs: structured.drugs.map((d) => d.name),
      }),
    }).catch(() => {}) // fire-and-forget
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
