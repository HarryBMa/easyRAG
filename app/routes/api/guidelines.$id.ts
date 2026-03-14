import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb, initDb } from '../../../lib/turso'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const APIRoute = createAPIFileRoute('/api/guidelines/$id')({
  GET: async ({ params }) => {
    await initDb()
    const db = getDb()

    const { rows } = await db.execute({
      sql: `SELECT g.*,
              json_agg(
                json_build_object(
                  'id', s.id, 'pubmed_id', s.pubmed_id, 'title', s.title,
                  'authors', s.authors, 'journal', s.journal, 'year', s.year,
                  'url', s.url, 'relevance_score', s.relevance_score
                )
              ) FILTER (WHERE s.id IS NOT NULL) AS sources
            FROM guidelines g
            LEFT JOIN sources s ON s.guideline_id = g.id
            WHERE g.id = $1
            GROUP BY g.id`,
      args: [params.id],
    })

    if (!rows.length) return json({ error: 'Not found' }, 404)

    const row = rows[0]
    const guideline = {
      ...row,
      structured_json:
        typeof row.structured_json === 'string'
          ? JSON.parse(row.structured_json as string)
          : row.structured_json,
      sources: (row.sources as unknown[] | null) ?? [],
    }

    return json(guideline)
  },
})
