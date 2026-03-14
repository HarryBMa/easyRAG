import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb } from '../../../lib/db'
import { deleteByGuideline } from '../../../lib/milvus'

export const APIRoute = createAPIFileRoute('/api/documents')({
  GET: async () => {
    const sql = await getDb()
    const documents = await sql`
      SELECT id, name, category, status, chunk_count, file_size, mime_type, created_at
      FROM documents
      ORDER BY created_at DESC
    `

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

    const sql = await getDb()
    await sql`DELETE FROM documents WHERE id = ${id}`

    try {
      await deleteByGuideline(id)
    } catch {
      // pgvector may not be set up; document is already removed from DB
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  },
})
