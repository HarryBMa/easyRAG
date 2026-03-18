import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb, initDb } from '../../../lib/turso'
import { deleteByGuideline } from '../../../lib/milvus'
import { trendingScore } from '../../../lib/scoring'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const APIRoute = createAPIFileRoute('/api/guidelines')({
  GET: async ({ request }) => {
    await initDb()
    const db = getDb()
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    const status = url.searchParams.get('status') ?? 'active'
    const sort = url.searchParams.get('sort') ?? 'trending'

    let sql = `SELECT id, title, hospital, category, structured_json,
                      confidence_score, source_quality, status,
                      upvotes, downvotes, pubmed_count, created_at, updated_at
               FROM guidelines WHERE status = ?`
    const args: (string | null)[] = [status]

    if (category) {
      sql += ` AND category = ?`
      args.push(category)
    }

    sql += ` ORDER BY created_at DESC`

    const { rows } = await db.execute({ sql, args })

    const guidelines = rows.map((r) => {
      const structured =
        typeof r.structured_json === 'string'
          ? JSON.parse(r.structured_json)
          : r.structured_json

      return {
        id: r.id,
        title: r.title,
        hospital: r.hospital,
        category: r.category,
        structured,
        confidence_score: r.confidence_score,
        source_quality: r.source_quality,
        status: r.status,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        pubmed_count: r.pubmed_count,
        created_at: r.created_at,
        updated_at: r.updated_at,
        trending_score:
          sort === 'trending'
            ? trendingScore({
                upvotes: r.upvotes as number,
                downvotes: r.downvotes as number,
                confidenceScore: r.confidence_score as number,
                pubmedCount: r.pubmed_count as number,
                createdAt: r.created_at as string,
              })
            : 0,
      }
    })

    if (sort === 'trending') {
      guidelines.sort((a, b) => b.trending_score - a.trending_score)
    }

    return json(guidelines)
  },

  DELETE: async ({ request }) => {
    await initDb()
    const { id } = (await request.json()) as { id: string }
    if (!id) return json({ error: 'Missing id' }, 400)

    const db = getDb()
    await db.execute({ sql: `DELETE FROM guidelines WHERE id = ?`, args: [id] })
    await db.execute({ sql: `DELETE FROM sources WHERE guideline_id = ?`, args: [id] })

    try {
      await deleteByGuideline(id)
    } catch {}

    return json({ ok: true })
  },
})
