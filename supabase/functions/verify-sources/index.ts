/**
 * Supabase Edge Function: verify-sources
 *
 * Receives a guideline (id, title, drug names) and searches PubMed/PMC for
 * related studies. Inserts matched citations into the `sources` table via
 * the Turso REST API and updates the guideline's pubmed_count.
 *
 * Deploy with:
 *   supabase functions deploy verify-sources
 *
 * NCBI E-utilities are free for non-commercial use (no API key required,
 * but set NCBI_API_KEY env var for higher rate limits — 10 req/s vs 3 req/s).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@libsql/client@0.14.0/web'

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const API_KEY = Deno.env.get('NCBI_API_KEY') ?? ''
const TURSO_URL = Deno.env.get('TURSO_DATABASE_URL') ?? ''
const TURSO_TOKEN = Deno.env.get('TURSO_AUTH_TOKEN') ?? ''

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
      // No results — still update pubmed_count to 0
      const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })
      await db.execute({
        sql: `UPDATE guidelines SET pubmed_count = 0 WHERE id = ?`,
        args: [guideline_id],
      })
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

    // Step 3: Persist to Turso
    const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

    const insertStatements = articles.map((article) => {
      const pmcId = article.articleids?.find((a) => a.idtype === 'pmc')?.value
      const url = pmcId
        ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`
        : `https://pubmed.ncbi.nlm.nih.gov/${article.uid}/`

      const year = parseInt(article.pubdate?.split(' ')[0] ?? '0', 10) || null
      const authorsStr = article.authors?.map((a) => a.name).join(', ') ?? ''

      return {
        sql: `INSERT OR IGNORE INTO sources
              (id, guideline_id, pubmed_id, title, authors, journal, year, relevance_score, url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          guideline_id,
          article.uid,
          article.title ?? '',
          authorsStr,
          article.fulljournalname ?? '',
          year,
          0.8,
          url,
        ],
      }
    })

    await db.batch([
      ...insertStatements,
      {
        sql: `UPDATE guidelines SET pubmed_count = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
        args: [articles.length, guideline_id],
      },
    ])

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
