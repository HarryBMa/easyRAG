import { createAPIFileRoute } from '@tanstack/react-start/api'
import { randomUUID } from 'crypto'
import { getDb, initDb } from '../../../lib/turso'
import { extractText } from '../../../lib/ocr'
import { structureGuideline } from '../../../lib/medllm'
import { evaluateGuideline } from '../../../lib/scoring'
import { embedBatch, chunkText } from '../../../lib/embed'
import { ensureCollection, upsertChunks } from '../../../lib/milvus'

// Split raw text into protocol sections — each becomes its own guideline record.
// Splits on markdown headers (## / ###) or lines that look like section titles
// (ALL CAPS or Title Case lines followed by a blank line).
function splitIntoSections(text: string, maxChars = 3000): string[] {
  const headerRe = /^(#{1,3} .+|[A-ZÅÄÖ][A-ZÅÄÖ\s\-\/]{8,})$/m
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

  // If no structural splits found, fall back to fixed-size chunks
  if (sections.length <= 1) {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += maxChars) {
      const chunk = text.slice(i, i + maxChars).trim()
      if (chunk.length > 200) chunks.push(chunk)
    }
    return chunks
  }

  return sections
}

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

    // Placeholder record so UI can show "processing" immediately
    await db.execute({
      sql: `INSERT INTO guidelines (id, title, hospital, status) VALUES (?, ?, ?, 'processing')`,
      args: [docId, file.name, hospital ?? null],
    })

    processDocument(docId, file, hospital).catch(async (err) => {
      console.error('[upload] ❌ pipeline failed:', err)
      await db.execute({
        sql: `UPDATE guidelines SET status = 'error' WHERE id = ?`,
        args: [docId],
      })
    })

    return json({ id: docId, name: file.name, status: 'processing' }, 202)
  },
})

async function processDocument(docId: string, file: File, hospital?: string) {
  const db = getDb()
  console.log(`[upload] 🚀 start "${file.name}" (${docId})`)

  // 0. Ensure pgvector table exists
  await ensureCollection()

  // 1. OCR
  console.log(`[upload] 📄 step 1: OCR`)
  const rawText = await extractText(file)
  console.log(`[upload] ✅ OCR done — ${rawText.length} chars`)

  // 2. Split into protocol sections (one guideline per section)
  const sections = splitIntoSections(rawText)
  const MAX_SECTIONS = 12
  const toProcess = sections.slice(0, MAX_SECTIONS)
  console.log(`[upload] 📑 ${sections.length} sections found, processing ${toProcess.length}`)

  // Delete the placeholder and replace with real records
  await db.execute({ sql: `DELETE FROM guidelines WHERE id = ?`, args: [docId] })

  let processed = 0
  for (const [i, section] of toProcess.entries()) {
    console.log(`[upload] 🤖 section ${i + 1}/${toProcess.length} — ${section.length} chars`)
    try {
      const structured = await structureGuideline(section, file.name)
      console.log(`[upload] ✅ section ${i + 1} — "${structured.title}" (${structured.category})`)

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

      // 3b. Vector indexing — chunk the full section text and embed all at once
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
      console.log(`[upload] 🔢 section ${i + 1} — ${chunks.length} chunks indexed`)

      processed++
    } catch (err) {
      console.warn(`[upload] ⚠️ section ${i + 1} failed:`, (err as Error).message)
    }
  }

  console.log(`[upload] 🎉 done — ${processed}/${toProcess.length} protocols saved from "${file.name}"`)
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
