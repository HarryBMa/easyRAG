import { createAPIFileRoute } from '@tanstack/react-start/api'
import { getDb, initDb } from '../../../lib/turso'
import {
  buildCitationGraph,
  type SourceSeed,
} from '../../../lib/citationGraph'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * GET /api/citation-graph?guideline_id=<id>
 *
 * Returns a force-directed graph for a guideline's citation network.
 * Nodes: the guideline itself + all linked source papers + their neighbours.
 * Edges: supports / contradicts (guideline→paper) + cites (paper→paper).
 *
 * The first call per guideline is slow (~5-15 s) while Semantic Scholar
 * is traversed. Subsequent calls should be cached by the client.
 */
export const APIRoute = createAPIFileRoute('/api/citation-graph')({
  GET: async ({ request }) => {
    const url = new URL(request.url)
    const guidelineId = url.searchParams.get('guideline_id')

    if (!guidelineId) {
      return json({ error: 'guideline_id is required' }, 400)
    }

    await initDb()
    const db = getDb()

    // Fetch guideline title
    const { rows: gRows } = await db.execute({
      sql: `SELECT title FROM guidelines WHERE id = ?`,
      args: [guidelineId],
    })
    if (!gRows.length) return json({ error: 'Guideline not found' }, 404)
    const guidelineTitle = gRows[0].title as string

    // Fetch linked sources
    const { rows: sRows } = await db.execute({
      sql: `SELECT pubmed_id, semantic_scholar_id, doi, title, authors, year, url, validation_type
            FROM sources
            WHERE guideline_id = ?
            ORDER BY citation_count DESC`,
      args: [guidelineId],
    })

    if (!sRows.length) {
      // Return a minimal graph with just the guideline node
      return json({
        nodes: [
          {
            id: `guideline:${guidelineId}`,
            type: 'guideline',
            title: guidelineTitle,
            year: null,
            citation_count: 0,
            authors: '',
            url: `/guidelines/${guidelineId}`,
          },
        ],
        edges: [],
        meta: { seeds: 0, message: 'No sources linked yet — run verification first' },
      })
    }

    const seeds: SourceSeed[] = sRows.map((r) => ({
      pubmed_id: r.pubmed_id as string | null,
      semantic_scholar_id: r.semantic_scholar_id as string | null,
      doi: r.doi as string | null,
      title: (r.title as string) ?? '',
      authors: (r.authors as string) ?? '',
      year: r.year as number | null,
      url: (r.url as string) ?? '',
      validation_type: (r.validation_type as SourceSeed['validation_type']) ?? 'unvalidated',
    }))

    const s2ApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? ''

    const graph = await buildCitationGraph(guidelineId, guidelineTitle, seeds, {
      s2ApiKey,
      maxSeeds: 5,
      maxNeighboursPerSeed: 8,
    })

    return json({
      ...graph,
      meta: {
        seeds: seeds.length,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      },
    })
  },
})
