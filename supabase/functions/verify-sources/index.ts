/**
 * Supabase Edge Function: verify-sources
 *
 * Searches multiple academic databases for studies that validate or contradict
 * a guideline or trick.
 *
 * Databases searched (all free):
 *   1. PubMed (NCBI E-utilities)  — primary biomedical index
 *   2. Europe PMC                 — incl. Cochrane, preprints, clinical guidelines
 *   3. Semantic Scholar           — AI-enriched, TLDRs, citation counts
 *   4. OpenAlex                   — 240 M+ works, open access
 *
 * Results are deduplicated by DOI before persisting.
 *
 * Deploy: supabase functions deploy verify-sources
 *
 * Environment variables:
 *   NCBI_API_KEY             — optional, raises rate limit from 3 → 10 req/s
 *   SEMANTIC_SCHOLAR_API_KEY — optional, raises limit to 10 req/s
 *   OPENALEX_EMAIL           — optional, enables polite-pool (higher limits)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const NCBI_KEY = Deno.env.get('NCBI_API_KEY') ?? ''
const S2_KEY = Deno.env.get('SEMANTIC_SCHOLAR_API_KEY') ?? ''
const OA_EMAIL = Deno.env.get('OPENALEX_EMAIL') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ── Types ───────────────────────────────────────────────────────────────────

type DatabaseSource = 'pubmed' | 'europe_pmc' | 'semantic_scholar' | 'openalex'
type ValidationType = 'validated' | 'contradicted' | 'unvalidated'

interface UnifiedResult {
  id: string
  title: string
  authors: string
  journal: string
  year: number | null
  abstract?: string
  url: string
  doi?: string
  citation_count: number
  tldr?: string
  database_source: DatabaseSource
  pubmed_id?: string
  semantic_scholar_id?: string
}

interface VerifyRequest {
  entity_type?: 'guideline' | 'trick'
  guideline_id?: string
  trick_id?: string
  title: string
  drugs?: string[]
  trick_content?: string
  confidence_score?: number
  source_quality?: number
}

// ── Contradiction detection ─────────────────────────────────────────────────

const CONTRADICTION_SIGNALS = [
  'contraindicated', 'not recommended', 'ineffective', 'no benefit',
  'harmful', 'adverse', 'refutes', 'disproven', 'failed to show',
  'no significant difference', 'safety concern', 'risk of', 'increased mortality',
  'should not be used', 'danger',
]

function detectContradiction(texts: string[]): boolean {
  const lower = texts.join(' ').toLowerCase()
  return CONTRADICTION_SIGNALS.some((s) => lower.includes(s))
}

// ── PubMed ───────────────────────────────────────────────────────────────────

async function searchPubMed(terms: string[]): Promise<UnifiedResult[]> {
  const ak = NCBI_KEY ? `&api_key=${NCBI_KEY}` : ''
  const query = terms.map((t) => `"${t}"[Title/Abstract]`).join(' OR ')

  const sr = await fetch(
    `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=10&retmode=json${ak}`,
  )
  const sd = await sr.json()
  const ids: string[] = sd.esearchresult?.idlist ?? []
  if (!ids.length) return []

  const sumR = await fetch(
    `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${ak}`,
  )
  const sumD = await sumR.json()
  const res = sumD.result ?? {}

  return ids.flatMap((id): UnifiedResult[] => {
    const a = res[id]
    if (!a) return []
    const pmcId = a.articleids?.find((x: { idtype: string }) => x.idtype === 'pmc')?.value
    const doi = a.articleids?.find((x: { idtype: string }) => x.idtype === 'doi')?.value
    return [{
      id: `pubmed:${a.uid}`,
      title: a.title ?? '',
      authors: a.authors?.map((x: { name: string }) => x.name).join(', ') ?? '',
      journal: a.fulljournalname ?? '',
      year: parseInt(a.pubdate?.split(' ')[0] ?? '0', 10) || null,
      url: pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${a.uid}/`,
      doi,
      citation_count: 0,
      database_source: 'pubmed',
      pubmed_id: a.uid,
    }]
  })
}

// ── Europe PMC ───────────────────────────────────────────────────────────────

async function searchEuropePMC(query: string): Promise<UnifiedResult[]> {
  const res = await fetch(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search` +
    `?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=8&sort=RELEVANCE`,
  )
  if (!res.ok) return []
  const data = await res.json()

  return (data.resultList?.result ?? []).map((r: Record<string, unknown>): UnifiedResult => {
    const pmid = r.pmid as string | undefined
    const pmcid = r.pmcid as string | undefined
    const doi = r.doi as string | undefined
    return {
      id: `epmc:${r.id}`,
      title: (r.title as string) ?? '',
      authors: (r.authorString as string) ?? '',
      journal: (r.journalTitle as string) ?? '',
      year: r.pubYear ? parseInt(r.pubYear as string, 10) : null,
      abstract: r.abstractText as string | undefined,
      url: pmcid
        ? `https://europepmc.org/article/PMC/${(pmcid).replace('PMC', '')}`
        : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '',
      doi,
      citation_count: (r.citedByCount as number) ?? 0,
      database_source: 'europe_pmc',
      pubmed_id: pmid,
    }
  })
}

// ── Semantic Scholar ──────────────────────────────────────────────────────────

async function searchSemanticScholar(query: string): Promise<UnifiedResult[]> {
  const fields = 'title,year,authors,abstract,citationCount,tldr,externalIds'
  const headers: Record<string, string> = {}
  if (S2_KEY) headers['x-api-key'] = S2_KEY

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search` +
    `?query=${encodeURIComponent(query)}&fields=${fields}&limit=8`,
    { headers },
  )
  if (!res.ok) return []
  const data = await res.json()

  return (data.data ?? []).map((p: Record<string, unknown>): UnifiedResult => ({
    id: `s2:${p.paperId}`,
    title: (p.title as string) ?? '',
    authors: (p.authors as { name: string }[])?.map((a) => a.name).join(', ') ?? '',
    journal: '',
    year: (p.year as number) ?? null,
    abstract: p.abstract as string | undefined,
    url: `https://www.semanticscholar.org/paper/${p.paperId}`,
    doi: (p.externalIds as Record<string, string> | undefined)?.DOI,
    citation_count: (p.citationCount as number) ?? 0,
    tldr: (p.tldr as { text: string } | undefined)?.text,
    database_source: 'semantic_scholar',
    pubmed_id: (p.externalIds as Record<string, string> | undefined)?.PubMed,
    semantic_scholar_id: p.paperId as string,
  }))
}

// ── OpenAlex ──────────────────────────────────────────────────────────────────

async function searchOpenAlex(query: string): Promise<UnifiedResult[]> {
  const fields = 'id,title,authorships,primary_location,publication_year,cited_by_count,doi'
  const ua = OA_EMAIL ? `easyRAG/1.0 (mailto:${OA_EMAIL})` : 'easyRAG/1.0'

  const res = await fetch(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&select=${fields}&per-page=8`,
    { headers: { 'User-Agent': ua } },
  )
  if (!res.ok) return []
  const data = await res.json()

  return (data.results ?? []).map((w: Record<string, unknown>): UnifiedResult => {
    const doi = w.doi as string | undefined
    const oaId = (w.id as string ?? '').split('/').pop() ?? ''
    const location = w.primary_location as Record<string, unknown> | null
    const journal = ((location?.source as Record<string, unknown> | null)?.display_name as string) ?? ''
    const authorships = (w.authorships as { author: { display_name: string } }[]) ?? []
    return {
      id: `openalex:${oaId}`,
      title: (w.title as string) ?? '',
      authors: authorships.map((a) => a.author.display_name).join(', '),
      journal,
      year: (w.publication_year as number) ?? null,
      url: doi ? `https://doi.org/${doi.replace('https://doi.org/', '')}` : `https://openalex.org/${oaId}`,
      doi,
      citation_count: (w.cited_by_count as number) ?? 0,
      database_source: 'openalex',
    }
  })
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedup(results: UnifiedResult[]): UnifiedResult[] {
  const seen = new Map<string, UnifiedResult>()
  for (const r of results) {
    const key = r.doi?.toLowerCase().replace(/^https?:\/\/doi\.org\//, '') ?? r.id
    if (!seen.has(key)) {
      seen.set(key, r)
    } else {
      const ex = seen.get(key)!
      if (!ex.abstract && r.abstract) ex.abstract = r.abstract
      if (!ex.tldr && r.tldr) ex.tldr = r.tldr
      if (!ex.semantic_scholar_id && r.semantic_scholar_id) ex.semantic_scholar_id = r.semantic_scholar_id
      if (!ex.pubmed_id && r.pubmed_id) ex.pubmed_id = r.pubmed_id
      ex.citation_count = Math.max(ex.citation_count, r.citation_count)
    }
  }
  return Array.from(seen.values())
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const body: VerifyRequest = await req.json()
    const entityType = body.entity_type ?? 'guideline'
    const guidelineId = body.guideline_id
    const trickId = body.trick_id
    const entityId = guidelineId ?? trickId

    if (!entityId || !body.title) {
      return Response.json(
        { error: 'entity id and title are required' },
        { status: 400, headers: CORS },
      )
    }

    const query =
      entityType === 'trick' && body.trick_content
        ? `${body.title} ${body.trick_content.slice(0, 120)}`
        : `${body.title} ${(body.drugs ?? []).slice(0, 3).join(' ')}`

    const pubmedTerms =
      entityType === 'trick' && body.trick_content
        ? [body.title, body.trick_content.slice(0, 120)]
        : [body.title, ...(body.drugs ?? []).slice(0, 3)]

    // Run all four searches in parallel
    const [pmRes, epmcRes, s2Res, oaRes] = await Promise.allSettled([
      searchPubMed(pubmedTerms),
      searchEuropePMC(query),
      searchSemanticScholar(query),
      searchOpenAlex(query),
    ])

    const all = [
      ...(pmRes.status === 'fulfilled' ? pmRes.value : []),
      ...(epmcRes.status === 'fulfilled' ? epmcRes.value : []),
      ...(s2Res.status === 'fulfilled' ? s2Res.value : []),
      ...(oaRes.status === 'fulfilled' ? oaRes.value : []),
    ]

    const articles = dedup(all)

    if (!articles.length) {
      if (entityType === 'guideline' && guidelineId) {
        await supabase.from('guidelines').update({ pubmed_count: 0 }).eq('id', guidelineId)
      } else if (entityType === 'trick' && trickId) {
        await supabase.from('tricks').update({ study_count: 0 }).eq('id', trickId)
      }
      return Response.json({ matches: 0 }, { headers: CORS })
    }

    const contradictionDetected = detectContradiction(
      articles.map((a) => `${a.title} ${a.abstract ?? ''}`),
    )
    const validationType: ValidationType = contradictionDetected
      ? 'contradicted'
      : 'validated'

    // Persist sources
    const rows = articles.map((a) => ({
      id: crypto.randomUUID(),
      guideline_id: entityType === 'guideline' ? guidelineId : null,
      trick_id: entityType === 'trick' ? trickId : null,
      pubmed_id: a.pubmed_id ?? null,
      title: a.title,
      authors: a.authors,
      journal: a.journal,
      year: a.year,
      relevance_score: 0.8,
      url: a.url,
      validation_type: validationType,
      database_source: a.database_source,
      doi: a.doi ?? null,
      abstract: a.abstract ?? null,
      citation_count: a.citation_count,
      semantic_scholar_id: a.semantic_scholar_id ?? null,
    }))

    const onConflict = entityType === 'trick' ? 'pubmed_id,trick_id' : 'pubmed_id,guideline_id'
    await supabase.from('sources').upsert(rows, { onConflict, ignoreDuplicates: true })

    // Update entity counts + confidence
    if (entityType === 'guideline' && guidelineId) {
      const updates: Record<string, unknown> = { pubmed_count: articles.length }
      if (body.confidence_score !== undefined) {
        let adj = body.confidence_score
        if (contradictionDetected) {
          adj = Math.max(0, adj - 0.2)
          updates.status = 'flagged'
        } else if (articles.length >= 3) {
          adj = Math.min(1, adj + 0.1)
        } else if (articles.length >= 1) {
          adj = Math.min(1, adj + 0.05)
        }
        updates.confidence_score = adj
      }
      await supabase.from('guidelines').update(updates).eq('id', guidelineId)
    }

    if (entityType === 'trick' && trickId) {
      await supabase.from('tricks').update({ study_count: articles.length }).eq('id', trickId)
    }

    return Response.json(
      {
        matches: articles.length,
        contradiction_detected: contradictionDetected,
        validation_type: validationType,
        by_database: {
          pubmed: pmRes.status === 'fulfilled' ? pmRes.value.length : 0,
          europe_pmc: epmcRes.status === 'fulfilled' ? epmcRes.value.length : 0,
          semantic_scholar: s2Res.status === 'fulfilled' ? s2Res.value.length : 0,
          openalex: oaRes.status === 'fulfilled' ? oaRes.value.length : 0,
        },
      },
      { headers: CORS },
    )
  } catch (err) {
    console.error('[verify-sources]', err)
    return Response.json({ error: String(err) }, { status: 500, headers: CORS })
  }
})
