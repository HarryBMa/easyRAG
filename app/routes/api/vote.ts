import { createAPIFileRoute } from '@tanstack/react-start/api'
import { randomUUID } from 'crypto'
import { getDb, initDb } from '../../../lib/turso'
import { computeBadges } from '../../../lib/scoring'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const APIRoute = createAPIFileRoute('/api/vote')({
  POST: async ({ request }) => {
    await initDb()
    const { entity_type, entity_id, user_id, vote_type } = (await request.json()) as {
      entity_type: 'guideline' | 'trick'
      entity_id: string
      user_id: string
      vote_type: 'up' | 'down'
    }

    if (!entity_type || !entity_id || !user_id || !vote_type) {
      return json({ error: 'Missing fields' }, 400)
    }

    const db = getDb()

    // Upsert vote — if same direction, remove (toggle); if different, replace
    const { rows: existing } = await db.execute({
      sql: `SELECT id, vote_type FROM votes WHERE entity_type = ? AND entity_id = ? AND user_id = ?`,
      args: [entity_type, entity_id, user_id],
    })

    const table = entity_type === 'guideline' ? 'guidelines' : 'tricks'

    if (existing.length) {
      const prev = existing[0].vote_type as string
      await db.execute({
        sql: `DELETE FROM votes WHERE id = ?`,
        args: [existing[0].id as string],
      })
      // Undo previous vote
      await db.execute({
        sql: `UPDATE ${table} SET ${prev === 'up' ? 'upvotes' : 'downvotes'} = GREATEST(0, ${prev === 'up' ? 'upvotes' : 'downvotes'} - 1) WHERE id = ?`,
        args: [entity_id],
      })
      // If toggling (different direction), record new vote
      if (prev !== vote_type) {
        await db.execute({
          sql: `INSERT INTO votes (id, entity_type, entity_id, user_id, vote_type) VALUES (?, ?, ?, ?, ?)`,
          args: [randomUUID(), entity_type, entity_id, user_id, vote_type],
        })
        await db.execute({
          sql: `UPDATE ${table} SET ${vote_type === 'up' ? 'upvotes' : 'downvotes'} = ${vote_type === 'up' ? 'upvotes' : 'downvotes'} + 1 WHERE id = ?`,
          args: [entity_id],
        })
      }
    } else {
      await db.execute({
        sql: `INSERT INTO votes (id, entity_type, entity_id, user_id, vote_type) VALUES (?, ?, ?, ?, ?)`,
        args: [randomUUID(), entity_type, entity_id, user_id, vote_type],
      })
      await db.execute({
        sql: `UPDATE ${table} SET ${vote_type === 'up' ? 'upvotes' : 'downvotes'} = ${vote_type === 'up' ? 'upvotes' : 'downvotes'} + 1 WHERE id = ?`,
        args: [entity_id],
      })
    }

    // Re-compute badges for tricks
    if (entity_type === 'trick') {
      const { rows } = await db.execute({
        sql: `SELECT upvotes, hospital_count, study_count FROM tricks WHERE id = ?`,
        args: [entity_id],
      })
      if (rows.length) {
        const badges = computeBadges({
          upvotes: rows[0].upvotes as number,
          hospitalCount: rows[0].hospital_count as number,
          studyCount: rows[0].study_count as number,
        })
        await db.execute({
          sql: `UPDATE tricks SET badges = ? WHERE id = ?`,
          args: [JSON.stringify(badges), entity_id],
        })
      }
    }

    return json({ ok: true })
  },
})
