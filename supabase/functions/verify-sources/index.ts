/**
 * Supabase Edge Function: verify-sources
 *
 * Searches PubMed for studies that validate or contradict a guideline or trick.
 * - Guidelines: updates pubmed_count + confidence_score based on results
 * - Tricks: updates study_count + saves sources linked by trick_id
 * - Both: detects contradictions from article titles, sets validation_type on sources
 *
 * Deploy with:
 *   supabase functions deploy verify-sources
 *
 * NCBI E-utilities are free for non-commercial use (no API key required,
 * but set NCBI_API_KEY env var for higher rate limits — 10 req/s vs 3 req/s).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const API_KEY = Deno.env.get('NCBI_API_KEY') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

/** Keywords in article titles that signal a contradiction or safety concern. */
const CONTRADICTION_SIGNALS = [
  'contraindicated',
  'not recommended',
  'ineffective',
  'no benefit',
  'harmful',
  'adverse',
  'refutes',
  'disproven',
  'failed to show',
  'no significant difference',
  'safety concern',
  'risk of',
  'danger',
]

function detectContradiction(titles: string[]): boolean {
  const lower = titles.join(' ').toLowerCase()
  return CONTRADICTION_SIGNALS.some((sig) => lower.includes(sig))
}

interface VerifyRequest {
  /** 'guideline' (default) or 'trick' */
  entity_type?: 'guideline' | 'trick'
  /** ID of the guideline (legacy field, kept for backwards compat) */
  guideline_id?: string
  /** ID of the trick when entity_type = 'trick' */
  trick_id?: string
  title: string
  drugs?: string[]
  /** Raw content of the trick — used to build a richer PubMed query */
  trick_content?: string
  /** Current confidence score of the guideline (used for re-scoring) */
  confidence_score?: number
  /** Current source_quality score of the guideline */
  source_quality?: number
}

interface PubMedArticle {
  uid: string
  title: string
  authors: { name: string }[]
  fulljournalname: string
  pubdate: string
  articleids: { idtype: string; value: string }[]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body: VerifyRequest = await req.json()
    const entityType = body.entity_type ?? 'guideline'
    const guidelineId = body.guideline_id
    const trickId = body.trick_id
    const entityId = guidelineId ?? trickId

    if (!entityId || !body.title) {
      return Response.json(
        { error: 'entity id (guideline_id or trick_id) and title are required' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    const apiKeyParam = API_KEY ? `&api_key=${API_KEY}` : ''

    // Build PubMed search terms
    const termParts =
      entityType === 'trick' && body.trick_content
        ? [body.title, body.trick_content.slice(0, 120)]
        : [body.title, ...(body.drugs ?? []).slice(0, 3)]

    const terms = termParts
      .map((t) => `"${t}"[Title/Abstract]`)
      .join(' OR ')

    // Step 1: Search PubMed
    const searchUrl =
      `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(terms)}` +
      `&retmax=10&retmode=json${apiKeyParam}`

    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()
    const ids: string[] = searchData.esearchresult?.idlist ?? []

    if (!ids.length) {
      // Update count to 0 for the appropriate entity
      if (entityType === 'guideline' && guidelineId) {
        await supabase
          .from('guidelines')
          .update({ pubmed_count: 0 })
          .eq('id', guidelineId)
      } else if (entityType === 'trick' && trickId) {
        await supabase.from('tricks').update({ study_count: 0 }).eq('id', trickId)
      }
      return Response.json({ matches: 0 }, { headers: CORS_HEADERS })
    }

    // Step 2: Fetch article summaries
    const summaryUrl =
      `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}` +
      `&retmode=json${apiKeyParam}`

    const summaryRes = await fetch(summaryUrl)
    const summaryData = await summaryRes.json()
    const result = summaryData.result ?? {}

    const articles: PubMedArticle[] = ids.map((id) => result[id]).filter(Boolean)

    // Step 3: Detect contradictions
    const articleTitles = articles.map((a) => a.title ?? '')
    const contradictionDetected = detectContradiction(articleTitles)
    const validationType = contradictionDetected
      ? 'contradicted'
      : articles.length > 0
        ? 'validated'
        : 'unvalidated'

    // Step 4: Persist sources
    const rows = articles.map((article) => {
      const pmcId = article.articleids?.find((a) => a.idtype === 'pmc')?.value
      const url = pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${article.uid}/`

      const year = parseInt(article.pubdate?.split(' ')[0] ?? '0', 10) || null
      const authorsStr = article.authors?.map((a) => a.name).join(', ') ?? ''

      return {
        id: crypto.randomUUID(),
        guideline_id: entityType === 'guideline' ? guidelineId : null,
        trick_id: entityType === 'trick' ? trickId : null,
        pubmed_id: article.uid,
        title: article.title ?? '',
        authors: authorsStr,
        journal: article.fulljournalname ?? '',
        year,
        relevance_score: 0.8,
        url,
        validation_type: validationType,
      }
    })

    const onConflict = entityType === 'trick'
      ? 'pubmed_id,trick_id'
      : 'pubmed_id,guideline_id'

    await supabase.from('sources').upsert(rows, { onConflict, ignoreDuplicates: true })

    // Step 5: Update entity counts + re-score confidence for guidelines
    if (entityType === 'guideline' && guidelineId) {
      // Base confidence update from PubMed evidence
      const updates: Record<string, unknown> = { pubmed_count: articles.length }

      if (body.confidence_score !== undefined) {
        let adjusted = body.confidence_score
        if (contradictionDetected) {
          adjusted = Math.max(0, adjusted - 0.2)
          updates.status = 'flagged'
        } else if (articles.length >= 3) {
          adjusted = Math.min(1, adjusted + 0.1)
        } else if (articles.length >= 1) {
          adjusted = Math.min(1, adjusted + 0.05)
        }
        updates.confidence_score = adjusted
      }

      await supabase.from('guidelines').update(updates).eq('id', guidelineId)
    }

    if (entityType === 'trick' && trickId) {
      await supabase
        .from('tricks')
        .update({ study_count: articles.length })
        .eq('id', trickId)
    }

    return Response.json(
      {
        matches: articles.length,
        ids,
        validation_type: validationType,
        contradiction_detected: contradictionDetected,
      },
      { headers: CORS_HEADERS },
    )
  } catch (err) {
    console.error('[verify-sources]', err)
    return Response.json(
      { error: String(err) },
      { status: 500, headers: CORS_HEADERS },
    )
  }
})
