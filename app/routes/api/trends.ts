import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb, initDb } from '../../../lib/turso'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const APIRoute = createAPIFileRoute('/api/trends')({
  GET: async () => {
    await initDb()
    const db = getDb()

    const [statsRes, categoryRes, researchGapsRes, flaggedRes] =
      await Promise.all([
        db.execute(`
          SELECT
            COUNT(*) AS total_guidelines,
            AVG(confidence_score) AS avg_confidence,
            SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) AS flagged_count,
            SUM(CASE WHEN status = 'needs_review' THEN 1 ELSE 0 END) AS review_count
          FROM guidelines
        `),
        db.execute(`
          SELECT category,
                 COUNT(*) AS count,
                 AVG(confidence_score) AS avg_confidence,
                 SUM(upvotes) AS total_upvotes
          FROM guidelines
          WHERE status = 'active'
          GROUP BY category
          ORDER BY count DESC
        `),
        // Tricks used in multiple hospitals but with no studies — research opportunities
        db.execute(`
          SELECT id, content, category, hospital_count, study_count,
                 upvotes, downvotes
          FROM tricks
          WHERE hospital_count >= 2 AND study_count = 0
          ORDER BY hospital_count DESC, upvotes DESC
          LIMIT 10
        `),
        db.execute(`
          SELECT id, title, category, confidence_score, source_quality,
                 structured_json, created_at
          FROM guidelines
          WHERE status IN ('flagged', 'needs_review')
          ORDER BY created_at DESC
          LIMIT 20
        `),
      ])

    return json({
      stats: statsRes.rows[0],
      by_category: categoryRes.rows,
      research_gaps: researchGapsRes.rows.map((r) => ({
        ...r,
        badges: JSON.parse((r.badges as string) || '[]'),
      })),
      flagged: flaggedRes.rows.map((r) => ({
        ...r,
        structured_json:
          typeof r.structured_json === 'string' && r.structured_json
            ? JSON.parse(r.structured_json as string)
            : null,
      })),
    })
  },
})
