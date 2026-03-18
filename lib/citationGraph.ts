/**
 * Citation / knowledge graph builder.
 *
 * Powers the connected-papers style map on guideline detail pages.
 * Uses Semantic Scholar (free, no auth required for small-volume use)
 * to traverse citation/reference relationships for each source paper.
 *
 * Semantic Scholar rate limits:
 *   - No key:  ~1 req/s  (100 req / 5 min)
 *   - With key: 10 req/s — set SEMANTIC_SCHOLAR_API_KEY env var
 */

export type NodeType = 'guideline' | 'trick' | 'paper' | 'review'

export interface GraphNode {
  id: string
  type: NodeType
  title: string
  year: number | null
  citation_count: number
  authors: string
  /** AI-generated one-sentence summary from Semantic Scholar */
  tldr?: string
  abstract?: string
  url: string
  validation_type?: 'validated' | 'contradicted' | 'unvalidated'
  database_source?: string
}

export interface GraphEdge {
  source: string
  target: string
  /** supports / contradicts = guideline ↔ paper; cites = paper ↔ paper */
  type: 'cites' | 'cited_by' | 'related' | 'supports' | 'contradicts'
  weight: number
}

export interface CitationGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ── Semantic Scholar API helpers ────────────────────────────────────────────

interface S2PaperSummary {
  paperId: string
  title: string
  year: number | null
  citationCount: number
  authors: { name: string }[]
}

interface S2PaperDetail extends S2PaperSummary {
  abstract?: string
  tldr?: { text: string }
  externalIds?: { DOI?: string; PubMed?: string }
  citations: S2PaperSummary[]
  references: S2PaperSummary[]
}

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper'
const DETAIL_FIELDS =
  'title,year,authors,citationCount,abstract,tldr,externalIds,' +
  'citations.title,citations.year,citations.citationCount,citations.authors,' +
  'references.title,references.year,references.citationCount,references.authors'

async function s2Fetch<T>(
  path: string,
  apiKey: string,
): Promise<T | null> {
  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey

  try {
    const res = await fetch(`${S2_BASE}/${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Resolve Semantic Scholar paper ID from a PubMed ID. */
export async function resolveS2FromPubMed(
  pubmedId: string,
  apiKey = '',
): Promise<string | null> {
  const data = await s2Fetch<{ paperId?: string }>(
    `PMID:${pubmedId}?fields=paperId`,
    apiKey,
  )
  return data?.paperId ?? null
}

/** Resolve Semantic Scholar paper ID from a DOI. */
export async function resolveS2FromDoi(
  doi: string,
  apiKey = '',
): Promise<string | null> {
  const normDoi = doi.replace(/^https?:\/\/doi\.org\//, '')
  const data = await s2Fetch<{ paperId?: string }>(
    `DOI:${normDoi}?fields=paperId`,
    apiKey,
  )
  return data?.paperId ?? null
}

function makeS2Node(
  p: S2PaperDetail | S2PaperSummary,
  type: NodeType,
  validationType?: GraphNode['validation_type'],
): GraphNode {
  const full = p as S2PaperDetail
  const titleLower = (p.title ?? '').toLowerCase()
  const resolvedType: NodeType =
    type !== 'paper'
      ? type
      : titleLower.includes('cochrane') ||
          titleLower.includes('systematic review') ||
          titleLower.includes('meta-analysis')
        ? 'review'
        : 'paper'

  return {
    id: `s2:${p.paperId}`,
    type: resolvedType,
    title: p.title ?? 'Unknown',
    year: p.year ?? null,
    citation_count: p.citationCount ?? 0,
    authors:
      p.authors
        ?.map((a) => a.name)
        .slice(0, 3)
        .join(', ') ?? '',
    tldr: full.tldr?.text,
    abstract: full.abstract,
    url: `https://www.semanticscholar.org/paper/${p.paperId}`,
    validation_type: validationType,
    database_source: 'semantic_scholar',
  }
}

// ── Graph builder ───────────────────────────────────────────────────────────

export interface SourceSeed {
  pubmed_id?: string | null
  semantic_scholar_id?: string | null
  doi?: string | null
  title: string
  authors: string
  year: number | null
  url: string
  validation_type: 'validated' | 'contradicted' | 'unvalidated'
}

export interface BuildGraphOptions {
  s2ApiKey?: string
  /** How many seed papers to expand. Higher = more API calls. Default: 5 */
  maxSeeds?: number
  /** Max citation/reference neighbours per seed. Default: 8 */
  maxNeighboursPerSeed?: number
}

/**
 * Build a citation graph centred on a guideline.
 *
 * Graph layout (concentric):
 *   centre   → guideline node
 *   ring 1   → source papers (linked directly to the guideline)
 *   ring 2   → papers that cite / are cited by ring-1 papers
 */
export async function buildCitationGraph(
  guidelineId: string,
  guidelineTitle: string,
  seeds: SourceSeed[],
  options: BuildGraphOptions = {},
): Promise<CitationGraph> {
  const {
    s2ApiKey = '',
    maxSeeds = 5,
    maxNeighboursPerSeed = 8,
  } = options

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  // Central guideline node
  const centreId = `guideline:${guidelineId}`
  nodes.set(centreId, {
    id: centreId,
    type: 'guideline',
    title: guidelineTitle,
    year: null,
    citation_count: 0,
    authors: '',
    url: `/guidelines/${guidelineId}`,
  })

  for (const seed of seeds.slice(0, maxSeeds)) {
    // Resolve Semantic Scholar ID
    let s2Id = seed.semantic_scholar_id ?? null
    if (!s2Id && seed.pubmed_id) {
      s2Id = await resolveS2FromPubMed(seed.pubmed_id, s2ApiKey)
      await pause(250)
    }
    if (!s2Id && seed.doi) {
      s2Id = await resolveS2FromDoi(seed.doi, s2ApiKey)
      await pause(250)
    }

    if (!s2Id) {
      // Add a bare node for seeds we can't expand
      const bareId = `bare:${seed.pubmed_id ?? hashTitle(seed.title)}`
      if (!nodes.has(bareId)) {
        nodes.set(bareId, {
          id: bareId,
          type: seed.title.toLowerCase().includes('systematic review')
            ? 'review'
            : 'paper',
          title: seed.title,
          year: seed.year,
          citation_count: 0,
          authors: seed.authors,
          url: seed.url,
          validation_type: seed.validation_type,
        })
      }
      edges.push({
        source: centreId,
        target: bareId,
        type: seed.validation_type === 'contradicted' ? 'contradicts' : 'supports',
        weight: 2,
      })
      continue
    }

    // Fetch full paper details with citations + references
    const paper = await s2Fetch<S2PaperDetail>(
      `${s2Id}?fields=${DETAIL_FIELDS}`,
      s2ApiKey,
    )
    await pause(350)
    if (!paper) continue

    const seedNodeId = `s2:${s2Id}`
    nodes.set(seedNodeId, makeS2Node(paper, 'paper', seed.validation_type))

    edges.push({
      source: centreId,
      target: seedNodeId,
      type: seed.validation_type === 'contradicted' ? 'contradicts' : 'supports',
      weight: 3,
    })

    // Top citations — papers that cite this seed (incoming influence)
    const citations = (paper.citations ?? [])
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, maxNeighboursPerSeed)

    for (const c of citations) {
      if (!c.paperId) continue
      const cId = `s2:${c.paperId}`
      if (!nodes.has(cId)) {
        nodes.set(cId, makeS2Node(c, 'paper'))
      }
      if (!edgeExists(edges, cId, seedNodeId)) {
        edges.push({ source: cId, target: seedNodeId, type: 'cites', weight: 1 })
      }
    }

    // Top references — papers this seed cites (outgoing influence)
    const references = (paper.references ?? [])
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
      .slice(0, maxNeighboursPerSeed)

    for (const r of references) {
      if (!r.paperId) continue
      const rId = `s2:${r.paperId}`
      if (!nodes.has(rId)) {
        nodes.set(rId, makeS2Node(r, 'paper'))
      }
      if (!edgeExists(edges, seedNodeId, rId)) {
        edges.push({ source: seedNodeId, target: rId, type: 'cites', weight: 1 })
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function hashTitle(title: string): string {
  return title.slice(0, 32).replace(/\W+/g, '_').toLowerCase()
}

function edgeExists(
  edges: GraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some((e) => e.source === source && e.target === target)
}
