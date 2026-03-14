import { createAPIFileRoute } from '@tanstack/react-start/api'
import { randomUUID } from 'crypto'
import { getDb, initDb } from '../../../lib/turso'
import { categorizeTrick } from '../../../lib/medllm'
import { computeBadges } from '../../../lib/scoring'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const APIRoute = createAPIFileRoute('/api/tricks')({
  GET: async ({ request }) => {
    await initDb()
    const db = getDb()
    const url = new URL(request.url)
    const category = url.searchParams.get('category')
    const sort = url.searchParams.get('sort') ?? 'top'

    let sql = `SELECT * FROM tricks`
    const args: string[] = []

    if (category) {
      sql += ` WHERE category = ?`
      args.push(category)
    }

    sql +=
      sort === 'top'
        ? ` ORDER BY (upvotes - downvotes) DESC, hospital_count DESC`
        : ` ORDER BY created_at DESC`

    const { rows } = await db.execute({ sql, args })

    return json(
      rows.map((r) => ({
        ...r,
        badges: JSON.parse((r.badges as string) || '[]'),
        related_guideline_ids: JSON.parse(
          (r.related_guideline_ids as string) || '[]',
        ),
      })),
    )
  },

  POST: async ({ request }) => {
    await initDb()
    const body = (await request.json()) as {
      content: string
      author?: string
      hospital?: string
    }

    if (!body.content?.trim()) return json({ error: 'content required' }, 400)

    const db = getDb()
    const id = randomUUID()
    let category = 'general'

    try {
      category = await categorizeTrick(body.content)
    } catch {}

    await db.execute({
      sql: `INSERT INTO tricks (id, content, author, hospital, category)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, body.content.trim(), body.author ?? null, body.hospital ?? null, category],
    })

    const { rows } = await db.execute({
      sql: `SELECT * FROM tricks WHERE id = ?`,
      args: [id],
    })

    const trick = rows[0]

    // Fire PubMed verification for the new trick (best-effort, non-blocking)
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
          entity_type: 'trick',
          trick_id: id,
          title: body.content.slice(0, 120),
          trick_content: body.content,
        }),
      }).catch(() => {})
    }

    return json({
      ...trick,
      badges: JSON.parse((trick.badges as string) || '[]'),
      related_guideline_ids: JSON.parse(
        (trick.related_guideline_ids as string) || '[]',
      ),
    }, 201)
  },
})
