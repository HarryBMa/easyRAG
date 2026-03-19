/**
 * Unified multi-database academic literature search.
 *
 * Free databases integrated:
 *   - PubMed (NCBI E-utilities)    — 35 M+ biomedical articles, clinical trials
 *   - Europe PMC                   — 40 M+ records including Cochrane reviews,
 *                                    preprints, book chapters
 *   - Semantic Scholar             — AI-enriched, citation graphs, TLDRs, open access
 *   - OpenAlex                     — 240 M+ works, concept mapping, fully open
 *   - SearxNG / Vane               — self-hosted meta-search covering Google Scholar,
 *                                    arXiv, CrossRef, BASE, and 70+ more engines.
 *                                    Set SEARXNG_URL to enable. Vane (github.com/ItzCrazyKns/Vane)
 *                                    is the recommended self-hosted front-end for SearxNG.
 *
 * Subscription-only (not integrated — require institutional access):
 *   - CINAHL      (EBSCO)      — nursing & allied health
 *   - Embase      (Elsevier)   — pharmacology & adverse events
 *   - Web of Science (Clarivate) — broad citation index
 *   - Scopus      (Elsevier)   — broad science
 *
 * Cochrane systematic reviews are available free via Europe PMC.
 */

export type DatabaseSource =
  | 'pubmed'
  | 'europe_pmc'
  | 'semantic_scholar'
  | 'openalex'
  | 'searxng'

export interface LiteratureResult {
  /** Dedup key — prefer DOI, else `source:id` */
  id: string
  title: string
  authors: string
  journal: string
  year: number | null
  abstract?: string
  url: string
  doi?: string
  citation_count: number
  /** AI-generated summary from Semantic Scholar */
  tldr?: string
  validation_type: 'validated' | 'contradicted' | 'unvalidated'
  database_source: DatabaseSource
  pubmed_id?: string
  semantic_scholar_id?: string
  openalex_id?: string
}

export interface UnifiedSearchResult {
  results: LiteratureResult[]
  contradiction_detected: boolean
  by_database: Record<DatabaseSource, number>
}

// Academic SearxNG engines to query (avoids double-hitting sources we already
// call directly: pubmed, semantic_scholar, openalex)
const SEARXNG_ACADEMIC_ENGINES = [
  'google scholar',
  'arxiv',
  'crossref',
  'base',
].join(',')

/** Map a SearxNG engine name to a short display label stored in database_source */
function searxngEngineLabel(engine: string): string {
  if (engine.includes('google')) return 'Google Scholar'
  if (engine === 'arxiv') return 'arXiv'
  if (engine === 'crossref') return 'CrossRef'
  if (engine === 'base') return 'BASE'
  return engine
}

// ── Contradiction detection ─────────────────────────────────────────────────

/**
 * High-confidence contradiction signals — phrases that specifically negate
 * a practice rather than merely discussing risks (which every medical paper does).
 * Deliberately conservative to avoid false positives on normal medical language.
 */
const CONTRADICTION_SIGNALS = [
  'should not be used',
  'must not be used',
  'is contraindicated',
  'are contraindicated',
  'has been disproven',
  'have been disproven',
  'was refuted',
  'were refuted',
  'failed to demonstrate efficacy',
  'no clinical benefit',
  'evidence does not support',
  'practice should be abandoned',
  'withdrawn from use',
  'recalled due to',
  'caused increased mortality',
  'significantly increased mortality',
]

export function detectContradiction(texts: string[]): boolean {
  const lower = texts.join(' ').toLowerCase()
  return CONTRADICTION_SIGNALS.some((sig) => lower.includes(sig))
}

// ── PubMed (NCBI E-utilities) ───────────────────────────────────────────────

interface PubMedArticle {
  uid: string
  title: string
  authors: { name: string }[]
  fulljournalname: string
  pubdate: string
  articleids: { idtype: string; value: string }[]
}

export async function searchPubMed(
  terms: string[],
  apiKey = '',
  limit = 10,
): Promise<LiteratureResult[]> {
  const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
  const ak = apiKey ? `&api_key=${apiKey}` : ''
  const query = terms.map((t) => `"${t}"[Title/Abstract]`).join(' OR ')

  const searchRes = await fetch(
    `${NCBI}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json${ak}`,
    { signal: AbortSignal.timeout(12_000) },
  )
  const searchData = await searchRes.json()
  const ids: string[] = searchData.esearchresult?.idlist ?? []
  if (!ids.length) return []

  const summaryRes = await fetch(
    `${NCBI}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${ak}`,
    { signal: AbortSignal.timeout(12_000) },
  )
  const summaryData = await summaryRes.json()
  const result = summaryData.result ?? {}

  return ids
    .map((id): LiteratureResult | null => {
      const a: PubMedArticle = result[id]
      if (!a) return null
      const pmcId = a.articleids?.find((x) => x.idtype === 'pmc')?.value
      const doi = a.articleids?.find((x) => x.idtype === 'doi')?.value
      return {
        id: `pubmed:${a.uid}`,
        title: a.title ?? '',
        authors: a.authors?.map((x) => x.name).join(', ') ?? '',
        journal: a.fulljournalname ?? '',
        year: parseInt(a.pubdate?.split(' ')[0] ?? '0', 10) || null,
        url: pmcId
          ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`
          : `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`,
        doi,
        citation_count: 0,
        validation_type: 'unvalidated',
        database_source: 'pubmed',
        pubmed_id: a.uid,
      }
    })
    .filter(Boolean) as LiteratureResult[]
}

// ── Europe PMC ──────────────────────────────────────────────────────────────
// Covers PubMed, Cochrane, preprints, book chapters, clinical guidelines

export async function searchEuropePMC(
  query: string,
  limit = 10,
): Promise<LiteratureResult[]> {
  const url =
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search` +
    `?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${limit}&sort=RELEVANCE`

  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!res.ok) return []
  const data = await res.json()
  const items: Record<string, unknown>[] = data.resultList?.result ?? []

  return items.map((r): LiteratureResult => {
    const pmid = r.pmid as string | undefined
    const pmcid = r.pmcid as string | undefined
    const doi = r.doi as string | undefined
    const articleUrl = pmcid
      ? `https://europepmc.org/article/PMC/${(pmcid as string).replace('PMC', '')}`
      : pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/search?query=${encodeURIComponent(r.title as string)}`

    return {
      id: `epmc:${r.id}`,
      title: (r.title as string) ?? '',
      authors: (r.authorString as string) ?? '',
      journal: (r.journalTitle as string) ?? '',
      year: r.pubYear ? parseInt(r.pubYear as string, 10) : null,
      abstract: r.abstractText as string | undefined,
      url: articleUrl,
      doi,
      citation_count: (r.citedByCount as number) ?? 0,
      validation_type: 'unvalidated',
      database_source: 'europe_pmc',
      pubmed_id: pmid,
    }
  })
}

// ── Semantic Scholar ────────────────────────────────────────────────────────
// Best source for citation graphs and AI-generated TLDRs

interface S2SearchPaper {
  paperId: string
  title: string
  year: number | null
  authors: { name: string }[]
  abstract?: string
  citationCount: number
  tldr?: { text: string }
  externalIds?: { DOI?: string; PubMed?: string }
}

export async function searchSemanticScholar(
  query: string,
  apiKey = '',
  limit = 10,
): Promise<LiteratureResult[]> {
  const fields =
    'title,year,authors,abstract,citationCount,tldr,externalIds,openAccessPdf'
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search` +
    `?query=${encodeURIComponent(query)}&fields=${fields}&limit=${limit}`

  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return []
  const data = await res.json()
  const papers: S2SearchPaper[] = data.data ?? []

  return papers.map((p): LiteratureResult => ({
    id: `s2:${p.paperId}`,
    title: p.title ?? '',
    authors: p.authors?.map((a) => a.name).join(', ') ?? '',
    journal: '',
    year: p.year ?? null,
    abstract: p.abstract,
    url: `https://www.semanticscholar.org/paper/${p.paperId}`,
    doi: p.externalIds?.DOI,
    citation_count: p.citationCount ?? 0,
    tldr: p.tldr?.text,
    validation_type: 'unvalidated',
    database_source: 'semantic_scholar',
    pubmed_id: p.externalIds?.PubMed,
    semantic_scholar_id: p.paperId,
  }))
}

// ── OpenAlex ────────────────────────────────────────────────────────────────
// Fully open, 240 M+ works, strong on concept mapping

export async function searchOpenAlex(
  query: string,
  limit = 10,
  emailContact = '',
): Promise<LiteratureResult[]> {
  const fields =
    'id,title,authorships,primary_location,publication_year,cited_by_count,doi,abstract_inverted_index'
  const userAgent = emailContact
    ? `easyRAG/1.0 (mailto:${emailContact})`
    : 'easyRAG/1.0'

  const res = await fetch(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&select=${fields}&per-page=${limit}`,
    { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(12_000) },
  )
  if (!res.ok) return []
  const data = await res.json()
  const works: Record<string, unknown>[] = data.results ?? []

  return works.map((w): LiteratureResult => {
    const doi = w.doi as string | undefined
    const oaId = (w.id as string) ?? ''
    const shortId = oaId.split('/').pop() ?? ''
    const location = w.primary_location as Record<string, unknown> | null
    const journalName =
      ((location?.source as Record<string, unknown> | null)
        ?.display_name as string) ?? ''
    const authorships = (w.authorships as {
      author: { display_name: string }
    }[]) ?? []

    // Reconstruct abstract from OpenAlex inverted index
    let abstract: string | undefined
    const inv = w.abstract_inverted_index as Record<string, number[]> | null
    if (inv) {
      const words: [number, string][] = []
      for (const [word, positions] of Object.entries(inv)) {
        for (const pos of positions) words.push([pos, word])
      }
      abstract = words
        .sort((a, b) => a[0] - b[0])
        .map((w) => w[1])
        .join(' ')
    }

    return {
      id: `openalex:${shortId}`,
      title: (w.title as string) ?? '',
      authors: authorships.map((a) => a.author.display_name).join(', '),
      journal: journalName,
      year: (w.publication_year as number) ?? null,
      abstract,
      url: doi
        ? `https://doi.org/${doi.replace('https://doi.org/', '')}`
        : `https://openalex.org/${shortId}`,
      doi,
      citation_count: (w.cited_by_count as number) ?? 0,
      validation_type: 'unvalidated',
      database_source: 'openalex',
      openalex_id: shortId,
    }
  })
}

// ── SearxNG / Vane ──────────────────────────────────────────────────────────
// Self-hosted meta-search. Enables Google Scholar (no public API otherwise),
// arXiv preprints, CrossRef, BASE, and any engine the instance has configured.
//
// Recommended setup: run Vane (https://github.com/ItzCrazyKns/Vane) locally,
// then set SEARXNG_URL=http://localhost:3001 (or wherever your Vane instance is).
//
// Alternatively, run a bare SearxNG instance:
//   docker run -d -p 8080:8080 searxng/searxng
// and set SEARXNG_URL=http://localhost:8080

interface SearxNGResult {
  title: string
  url: string
  content?: string
  author?: string
  publishedDate?: string
  engine?: string
  score?: number
}

export async function searchSearxNG(
  query: string,
  searxngUrl: string,
  limit = 10,
): Promise<LiteratureResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    categories: 'science',
    engines: SEARXNG_ACADEMIC_ENGINES,
    language: 'en',
    pageno: '1',
  })

  const res = await fetch(`${searxngUrl.replace(/\/$/, '')}/search?${params}`, {
    headers: { 'User-Agent': 'easyRAG/1.0' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return []
  const data = await res.json()
  const items: SearxNGResult[] = data.results ?? []

  return items.slice(0, limit).map((r, i): LiteratureResult => {
    // Extract DOI from CrossRef / DOI resolver URLs
    const doiMatch = r.url.match(/doi\.org\/(10\.\S+)/i)
    const doi = doiMatch?.[1]

    // Parse year from publishedDate (ISO or partial)
    let year: number | null = null
    if (r.publishedDate) {
      const y = parseInt(r.publishedDate.slice(0, 4), 10)
      if (y > 1900 && y <= new Date().getFullYear() + 1) year = y
    }

    // arXiv ID → stable URL
    const arxivMatch = r.url.match(/arxiv\.org\/abs\/([\d.]+)/i)
    const canonicalUrl = arxivMatch
      ? `https://arxiv.org/abs/${arxivMatch[1]}`
      : r.url

    const engine = r.engine ?? 'searxng'

    return {
      id: `searxng:${doi ?? canonicalUrl ?? i}`,
      title: r.title ?? '',
      authors: r.author ?? '',
      journal: searxngEngineLabel(engine),
      year,
      abstract: r.content,
      url: canonicalUrl,
      doi,
      citation_count: 0,
      validation_type: 'unvalidated',
      database_source: 'searxng',
    }
  })
}

// ── Deduplication ───────────────────────────────────────────────────────────

function normaliseDoi(doi: string | undefined): string | undefined {
  return doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, '')
}

function deduplicate(results: LiteratureResult[]): LiteratureResult[] {
  const seen = new Map<string, LiteratureResult>()

  for (const r of results) {
    const key = normaliseDoi(r.doi) ?? r.id
    if (!seen.has(key)) {
      seen.set(key, r)
    } else {
      // Merge: take the richest data from each source
      const existing = seen.get(key)!
      if (!existing.abstract && r.abstract) existing.abstract = r.abstract
      if (!existing.tldr && r.tldr) existing.tldr = r.tldr
      if (!existing.semantic_scholar_id && r.semantic_scholar_id)
        existing.semantic_scholar_id = r.semantic_scholar_id
      if (!existing.pubmed_id && r.pubmed_id)
        existing.pubmed_id = r.pubmed_id
      if (!existing.openalex_id && r.openalex_id)
        existing.openalex_id = r.openalex_id
      existing.citation_count = Math.max(
        existing.citation_count,
        r.citation_count,
      )
    }
  }

  return Array.from(seen.values())
}

// ── Unified search ──────────────────────────────────────────────────────────

export async function unifiedLiteratureSearch(params: {
  /** Human-readable query (used by Europe PMC, S2, OpenAlex, SearxNG) */
  query: string
  /** Structured term list for PubMed Title/Abstract search */
  terms?: string[]
  pubmedApiKey?: string
  s2ApiKey?: string
  /** polite-pool contact email for OpenAlex */
  openAlexEmail?: string
  /**
   * URL of a SearxNG or Vane instance. When set, adds Google Scholar,
   * arXiv, CrossRef and BASE results. Set via SEARXNG_URL env var.
   * Vane: https://github.com/ItzCrazyKns/Vane
   */
  searxngUrl?: string
  maxPerDb?: number
}): Promise<UnifiedSearchResult> {
  const {
    query,
    terms = [query],
    pubmedApiKey = '',
    s2ApiKey = '',
    openAlexEmail = '',
    searxngUrl = '',
    maxPerDb = 8,
  } = params

  const searches: Promise<PromiseSettledResult<LiteratureResult[]>>[] = [
    Promise.allSettled([searchPubMed(terms, pubmedApiKey, maxPerDb)]).then((r) => r[0]),
    Promise.allSettled([searchEuropePMC(query, maxPerDb)]).then((r) => r[0]),
    Promise.allSettled([searchSemanticScholar(query, s2ApiKey, maxPerDb)]).then((r) => r[0]),
    Promise.allSettled([searchOpenAlex(query, maxPerDb, openAlexEmail)]).then((r) => r[0]),
  ]
  if (searxngUrl) {
    searches.push(
      Promise.allSettled([searchSearxNG(query, searxngUrl, maxPerDb)]).then((r) => r[0]),
    )
  }

  const [pubmed, epmc, s2, openalex, searxng] = await Promise.all(searches)

  const all = [
    ...(pubmed?.status === 'fulfilled' ? pubmed.value : []),
    ...(epmc?.status === 'fulfilled' ? epmc.value : []),
    ...(s2?.status === 'fulfilled' ? s2.value : []),
    ...(openalex?.status === 'fulfilled' ? openalex.value : []),
    ...(searxng?.status === 'fulfilled' ? searxng.value : []),
  ]

  const deduped = deduplicate(all)
  const contradiction_detected = detectContradiction(
    deduped.map((r) => `${r.title} ${r.abstract ?? ''}`),
  )

  const validationType = contradiction_detected
    ? 'contradicted'
    : deduped.length > 0
      ? 'validated'
      : 'unvalidated'
  deduped.forEach((r) => {
    r.validation_type = validationType
  })

  return {
    results: deduped,
    contradiction_detected,
    by_database: {
      pubmed: pubmed?.status === 'fulfilled' ? pubmed.value.length : 0,
      europe_pmc: epmc?.status === 'fulfilled' ? epmc.value.length : 0,
      semantic_scholar: s2?.status === 'fulfilled' ? s2.value.length : 0,
      openalex: openalex?.status === 'fulfilled' ? openalex.value.length : 0,
      searxng: searxng?.status === 'fulfilled' ? searxng.value.length : 0,
    },
  }
}
