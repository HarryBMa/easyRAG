/**
 * Supabase Edge Function: verify-sources
 *
 * Receives a guideline (id, title, drug names) and searches PubMed/PMC for
 * related studies. Inserts matched citations into the `sources` table and
 * updates the guideline's pubmed_count via the Supabase Postgres client.
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

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase runtime
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface VerifyRequest {
  guideline_id: string
  title: string
  drugs?: string[]
}

interface PubMedArticle {
  uid: string
  title: string
  authors: { name: string }[]
  fulljournalname: string
  pubdate: string
  articleids: { idtype: string; value: string }[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const body: VerifyRequest = await req.json()
    const { guideline_id, title, drugs = [] } = body

    if (!guideline_id || !title) {
      return Response.json({ error: 'guideline_id and title are required' }, { status: 400 })
    }

    // Build search query
    const terms = [title, ...drugs.slice(0, 3)]
      .map((t) => `"${t}"[Title/Abstract]`)
      .join(' OR ')

    const apiKeyParam = API_KEY ? `&api_key=${API_KEY}` : ''

    // Step 1: Search PubMed
    const searchUrl =
      `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(terms)}` +
      `&retmax=10&retmode=json${apiKeyParam}`

    const searchRes = await fetch(searchUrl)
    const searchData = await searchRes.json()
    const ids: string[] = searchData.esearchresult?.idlist ?? []

    if (!ids.length) {
      await supabase
        .from('guidelines')
        .update({ pubmed_count: 0 })
        .eq('id', guideline_id)
      return Response.json({ matches: 0 })
    }

    // Step 2: Fetch summaries
    const summaryUrl =
      `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}` +
      `&retmode=json${apiKeyParam}`

    const summaryRes = await fetch(summaryUrl)
    const summaryData = await summaryRes.json()
    const result = summaryData.result ?? {}

    const articles: PubMedArticle[] = ids
      .map((id) => result[id])
      .filter(Boolean)

    // Step 3: Persist to Supabase Postgres
    const rows = articles.map((article) => {
      const pmcId = article.articleids?.find((a) => a.idtype === 'pmc')?.value
      const url = pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${article.uid}/`

      const year = parseInt(article.pubdate?.split(' ')[0] ?? '0', 10) || null
      const authorsStr = article.authors?.map((a) => a.name).join(', ') ?? ''

      return {
        id: crypto.randomUUID(),
        guideline_id,
        pubmed_id: article.uid,
        title: article.title ?? '',
        authors: authorsStr,
        journal: article.fulljournalname ?? '',
        year,
        relevance_score: 0.8,
        url,
      }
    })

    await supabase.from('sources').upsert(rows, { onConflict: 'pubmed_id,guideline_id', ignoreDuplicates: true })

    await supabase
      .from('guidelines')
      .update({ pubmed_count: articles.length })
      .eq('id', guideline_id)

    return Response.json(
      { matches: articles.length, ids },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  } catch (err) {
    console.error('[verify-sources]', err)
    return Response.json(
      { error: String(err) },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
})
