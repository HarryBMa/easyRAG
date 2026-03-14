import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb } from '../../../lib/db'
import { getMilvusClient } from '../../../lib/milvus'

export const APIRoute = createAPIFileRoute('/api/documents')({
  GET: async () => {
    const db = getDb()
    const documents = db
      .prepare(
        `SELECT id, name, category, status, chunk_count, file_size, mime_type, created_at
         FROM documents ORDER BY created_at DESC`,
      )
      .all()

    return new Response(JSON.stringify(documents), {
      headers: { 'Content-Type': 'application/json' },
    })
  },

  DELETE: async ({ request }) => {
    const { id } = (await request.json()) as { id: string }
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const db = getDb()
    db.prepare(`DELETE FROM documents WHERE id = ?`).run(id)

    // Remove chunks from Milvus
    try {
      const milvus = getMilvusClient()
      await milvus.delete({
        collection_name: 'document_chunks',
        filter: `doc_id == "${id}"`,
      })
    } catch {
      // Milvus may not be running; document is already removed from DB
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
