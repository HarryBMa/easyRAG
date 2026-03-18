/**
 * Obsidian vault sync for easyRAG.
 *
 * Converts guidelines, source papers, and tricks into Obsidian-flavoured
 * markdown files with YAML frontmatter (Dataview-compatible) and [[wikilinks]]
 * so Obsidian's graph view mirrors the citation network.
 *
 * Vault layout:
 *   {vault}/
 *     Guidelines/    {slug}.md   — one note per clinical guideline
 *     Sources/       {slug}.md   — one note per linked paper/article
 *     Tricks/        {slug}.md   — one note per crowd-sourced tip
 *     _index.md                  — dashboard with Dataview queries
 *
 * Obsidian features used:
 *   - YAML frontmatter  → Dataview plugin queries
 *   - [[wikilinks]]     → graph edges (guideline ↔ source, paper ↔ paper)
 *   - #tags             → filtering by category, validation type, database
 *   - Callout blocks    → evidence / contradiction warnings
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// ── Types (mirror DB rows) ───────────────────────────────────────────────────

export interface DbGuideline {
  id: string
  title: string
  hospital?: string | null
  category: string
  raw_text?: string | null
  structured_json?: string | null
  confidence_score: number
  source_quality: number
  status: string
  upvotes: number
  downvotes: number
  pubmed_count: number
  created_at: string
  updated_at: string
}

export interface DbSource {
  id: string
  guideline_id?: string | null
  trick_id?: string | null
  pubmed_id?: string | null
  title: string
  authors?: string | null
  journal?: string | null
  year?: number | null
  url?: string | null
  validation_type: string
  database_source: string
  doi?: string | null
  abstract?: string | null
  citation_count: number
  semantic_scholar_id?: string | null
  openalex_id?: string | null
  tldr?: string | null
}

export interface DbTrick {
  id: string
  content: string
  author?: string | null
  hospital?: string | null
  category: string
  upvotes: number
  downvotes: number
  hospital_count: number
  study_count: number
  badges: string        // JSON array
  related_guideline_ids: string  // JSON array
  created_at: string
}

// ── Slug helpers ─────────────────────────────────────────────────────────────

export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trimEnd()
}

/** Obsidian-safe filename (no : / \ etc.) */
export function safeFilename(title: string): string {
  return slugify(title).replace(/[<>:"\\|?*]/g, '-')
}

// ── Confidence / quality labels ──────────────────────────────────────────────

function confidenceLabel(score: number): string {
  if (score >= 0.85) return 'high'
  if (score >= 0.6) return 'medium'
  return 'low'
}

function validationEmoji(type: string): string {
  if (type === 'validated') return '✅'
  if (type === 'contradicted') return '⚠️'
  return '❓'
}

function databaseLabel(src: string): string {
  const labels: Record<string, string> = {
    pubmed: 'PubMed',
    europe_pmc: 'Europe PMC',
    semantic_scholar: 'Semantic Scholar',
    openalex: 'OpenAlex',
  }
  return labels[src] ?? src
}

// ── YAML frontmatter builder ─────────────────────────────────────────────────

function yamlStr(value: string): string {
  const escaped = value.replace(/"/g, '\\"').replace(/\n/g, ' ')
  return `"${escaped}"`
}

function yamlLines(pairs: [string, string | number | boolean | string[]][]): string {
  return pairs
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.length === 0) return `${k}: []`
        return `${k}:\n${v.map((item) => `  - ${yamlStr(String(item))}`).join('\n')}`
      }
      if (typeof v === 'string') return `${k}: ${yamlStr(v)}`
      return `${k}: ${v}`
    })
    .join('\n')
}

// ── Guideline markdown ───────────────────────────────────────────────────────

export function guidelineToMarkdown(
  g: DbGuideline,
  sources: DbSource[],
  relatedTrickTitles: string[],
): string {
  let structured: Record<string, unknown> = {}
  try {
    if (g.structured_json) structured = JSON.parse(g.structured_json)
  } catch {
    /* ignore */
  }

  const drugs = (structured.drugs as { name: string; dose: string; route: string; timing?: string }[]) ?? []
  const steps = (structured.steps as string[]) ?? []
  const indications = (structured.indications as string[]) ?? []
  const contraindications = (structured.contraindications as string[]) ?? []
  const notes = (structured.notes as string[]) ?? []

  const validatedSources = sources.filter((s) => s.validation_type === 'validated')
  const contradictedSources = sources.filter((s) => s.validation_type === 'contradicted')
  const tags = [
    g.category.replace(/[^a-z0-9_]/gi, '-'),
    g.status,
    `confidence-${confidenceLabel(g.confidence_score)}`,
    ...(validatedSources.length > 0 ? ['evidence-backed'] : []),
    ...(contradictedSources.length > 0 ? ['has-contradictions'] : []),
  ]

  const fm = yamlLines([
    ['type', 'guideline'],
    ['id', g.id],
    ['title', g.title],
    ['category', g.category],
    ['hospital', g.hospital ?? ''],
    ['status', g.status],
    ['confidence_score', g.confidence_score],
    ['source_quality', g.source_quality],
    ['upvotes', g.upvotes],
    ['downvotes', g.downvotes],
    ['pubmed_count', g.pubmed_count],
    ['created_at', g.created_at],
    ['updated_at', g.updated_at],
    ['tags', tags],
  ])

  const lines: string[] = []
  lines.push(`---\n${fm}\n---\n`)
  lines.push(`# ${g.title}\n`)

  // Confidence callout
  const pct = Math.round(g.confidence_score * 100)
  const calloutType =
    g.confidence_score >= 0.85 ? 'success'
    : g.confidence_score >= 0.6 ? 'info'
    : 'warning'
  lines.push(`> [!${calloutType}] Evidence Confidence: ${pct}%`)
  lines.push(`> Source quality: ${Math.round(g.source_quality * 100)}%  ·  ${g.pubmed_count} studies found  ·  Status: **${g.status}**\n`)

  if (indications.length) {
    lines.push(`## Indications`)
    indications.forEach((ind) => lines.push(`- ${ind}`))
    lines.push('')
  }

  if (contraindications.length) {
    lines.push(`## Contraindications`)
    contraindications.forEach((ci) => lines.push(`- ⛔ ${ci}`))
    lines.push('')
  }

  if (drugs.length) {
    lines.push(`## Drug Protocol`)
    drugs.forEach((d) => {
      lines.push(`- **${d.name}** — ${d.dose} · ${d.route}${d.timing ? ` · ${d.timing}` : ''}`)
    })
    lines.push('')
  }

  if (steps.length) {
    lines.push(`## Steps`)
    steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`))
    lines.push('')
  }

  if (notes.length) {
    lines.push(`## Clinical Notes`)
    notes.forEach((n) => lines.push(`> ${n}`))
    lines.push('')
  }

  // Supporting sources — these become graph edges in Obsidian
  if (validatedSources.length) {
    lines.push(`## Supporting Evidence`)
    lines.push(`> [!success] ${validatedSources.length} supporting ${validatedSources.length === 1 ? 'study' : 'studies'} found across multiple databases\n`)
    validatedSources.forEach((s) => {
      const link = `[[Sources/${safeFilename(s.title)}|${s.title}]]`
      const meta = [s.year, s.journal, s.citation_count > 0 ? `${s.citation_count} citations` : null]
        .filter(Boolean)
        .join(' · ')
      lines.push(`- ✅ ${link}${meta ? `  *(${meta})*` : ''}`)
      if (s.tldr) lines.push(`  > *${s.tldr}*`)
    })
    lines.push('')
  }

  if (contradictedSources.length) {
    lines.push(`## Contradicting Evidence`)
    lines.push(`> [!warning] Review these findings — they may conflict with this guideline\n`)
    contradictedSources.forEach((s) => {
      const link = `[[Sources/${safeFilename(s.title)}|${s.title}]]`
      lines.push(`- ⚠️ ${link}`)
      if (s.tldr) lines.push(`  > *${s.tldr}*`)
    })
    lines.push('')
  }

  if (relatedTrickTitles.length) {
    lines.push(`## Crowd Tips`)
    relatedTrickTitles.forEach((t) => {
      lines.push(`- [[Tricks/${safeFilename(t)}|${t}]]`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

// ── Source / paper markdown ──────────────────────────────────────────────────

export function sourceToMarkdown(
  s: DbSource,
  linkedGuidelineTitles: string[],
  citedByTitles: string[],
  citesTitles: string[],
): string {
  const tags = [
    s.database_source,
    s.validation_type,
    ...(s.journal?.toLowerCase().includes('cochrane') ? ['cochrane'] : []),
    ...(s.title.toLowerCase().includes('systematic review') ? ['systematic-review'] : []),
    ...(s.title.toLowerCase().includes('meta-analysis') ? ['meta-analysis'] : []),
    ...(s.title.toLowerCase().includes('randomised') || s.title.toLowerCase().includes('randomized')
      ? ['rct'] : []),
  ]

  const fm = yamlLines([
    ['type', 'source'],
    ['id', s.id],
    ['title', s.title],
    ['authors', s.authors ?? ''],
    ['journal', s.journal ?? ''],
    ['year', s.year ?? 0],
    ['doi', s.doi ?? ''],
    ['url', s.url ?? ''],
    ['pubmed_id', s.pubmed_id ?? ''],
    ['semantic_scholar_id', s.semantic_scholar_id ?? ''],
    ['openalex_id', s.openalex_id ?? ''],
    ['citation_count', s.citation_count],
    ['database_source', s.database_source],
    ['validation_type', s.validation_type],
    ['tags', tags],
  ])

  const lines: string[] = []
  lines.push(`---\n${fm}\n---\n`)
  lines.push(`# ${s.title}\n`)

  // Paper meta bar
  const metaParts: string[] = []
  if (s.authors) metaParts.push(`**Authors:** ${s.authors}`)
  if (s.journal) metaParts.push(`**Journal:** ${s.journal}`)
  if (s.year) metaParts.push(`**Year:** ${s.year}`)
  if (s.citation_count > 0) metaParts.push(`**Citations:** ${s.citation_count.toLocaleString()}`)
  if (metaParts.length) lines.push(metaParts.join('  ·  ') + '\n')

  // Source badge
  lines.push(`> [!info] Source: ${databaseLabel(s.database_source)}  ·  ${validationEmoji(s.validation_type)} ${s.validation_type}\n`)

  if (s.tldr) {
    lines.push(`## TL;DR`)
    lines.push(`> *${s.tldr}*\n`)
  }

  if (s.abstract) {
    lines.push(`## Abstract\n${s.abstract}\n`)
  }

  if (s.url) {
    lines.push(`## Links`)
    lines.push(`- [Open paper](${s.url})`)
    if (s.doi) lines.push(`- [DOI](https://doi.org/${s.doi.replace(/^https?:\/\/doi\.org\//, '')})`)
    if (s.pubmed_id) lines.push(`- [PubMed](https://pubmed.ncbi.nlm.nih.gov/${s.pubmed_id}/)`)
    if (s.semantic_scholar_id) {
      lines.push(`- [Semantic Scholar](https://www.semanticscholar.org/paper/${s.semantic_scholar_id})`)
    }
    lines.push('')
  }

  // Wikilinks to guidelines — graph edges
  if (linkedGuidelineTitles.length) {
    lines.push(`## Referenced by Guidelines`)
    linkedGuidelineTitles.forEach((t) => {
      lines.push(`- [[Guidelines/${safeFilename(t)}|${t}]]`)
    })
    lines.push('')
  }

  // Citation graph links — paper → paper edges in Obsidian graph
  if (citedByTitles.length) {
    lines.push(`## Cited By (in this system)`)
    citedByTitles.slice(0, 10).forEach((t) => {
      lines.push(`- [[Sources/${safeFilename(t)}|${t}]]`)
    })
    lines.push('')
  }

  if (citesTitles.length) {
    lines.push(`## References (in this system)`)
    citesTitles.slice(0, 10).forEach((t) => {
      lines.push(`- [[Sources/${safeFilename(t)}|${t}]]`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

// ── Trick markdown ───────────────────────────────────────────────────────────

export function trickToMarkdown(
  t: DbTrick,
  relatedGuidelineTitles: string[],
  sources: DbSource[],
): string {
  let badges: string[] = []
  try { badges = JSON.parse(t.badges) } catch { /* */ }

  const tags = [
    t.category.replace(/[^a-z0-9_]/gi, '-'),
    ...(t.study_count > 0 ? ['evidence-backed'] : ['community-tip']),
    ...badges,
  ]

  const fm = yamlLines([
    ['type', 'trick'],
    ['id', t.id],
    ['hospital', t.hospital ?? ''],
    ['category', t.category],
    ['upvotes', t.upvotes],
    ['downvotes', t.downvotes],
    ['hospital_count', t.hospital_count],
    ['study_count', t.study_count],
    ['badges', badges],
    ['created_at', t.created_at],
    ['tags', tags],
  ])

  // Use first 80 chars of content as title
  const displayTitle = t.content.length > 80
    ? t.content.slice(0, 80).trimEnd() + '…'
    : t.content

  const lines: string[] = []
  lines.push(`---\n${fm}\n---\n`)
  lines.push(`# Tip: ${displayTitle}\n`)

  if (t.hospital) lines.push(`**Hospital:** ${t.hospital}  ·  **Used at ${t.hospital_count} sites**\n`)

  lines.push(t.content + '\n')

  if (badges.length) {
    lines.push(`**Badges:** ${badges.map((b) => `\`${b}\``).join(' ')}\n`)
  }

  if (sources.length) {
    lines.push(`## Supporting Studies`)
    sources.forEach((s) => {
      const link = `[[Sources/${safeFilename(s.title)}|${s.title}]]`
      lines.push(`- ${validationEmoji(s.validation_type)} ${link}${s.year ? ` *(${s.year})*` : ''}`)
    })
    lines.push('')
  }

  if (relatedGuidelineTitles.length) {
    lines.push(`## Related Guidelines`)
    relatedGuidelineTitles.forEach((gt) => {
      lines.push(`- [[Guidelines/${safeFilename(gt)}|${gt}]]`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

// ── Dashboard index ──────────────────────────────────────────────────────────

export function indexMarkdown(stats: {
  guidelines: number
  sources: number
  tricks: number
  generatedAt: string
}): string {
  return `---
type: index
generated_at: "${stats.generatedAt}"
---

# easyRAG Knowledge Base

> Synced from easyRAG · ${stats.generatedAt}

| | Count |
|---|---|
| Guidelines | ${stats.guidelines} |
| Source papers | ${stats.sources} |
| Crowd tips | ${stats.tricks} |

---

## Active Guidelines (Dataview)

\`\`\`dataview
TABLE confidence_score AS "Confidence", pubmed_count AS "Studies", hospital, status
FROM "Guidelines"
WHERE status = "active"
SORT confidence_score DESC
\`\`\`

## High-Evidence Sources

\`\`\`dataview
TABLE authors, year, citation_count AS "Citations", journal, validation_type AS "Status"
FROM "Sources"
WHERE citation_count > 100
SORT citation_count DESC
LIMIT 20
\`\`\`

## Contradicted Guidelines ⚠️

\`\`\`dataview
LIST
FROM "Guidelines"
WHERE contains(tags, "has-contradictions")
\`\`\`

## Recent Tricks with Evidence

\`\`\`dataview
TABLE hospital, study_count AS "Studies", upvotes
FROM "Tricks"
WHERE study_count > 0
SORT upvotes DESC
\`\`\`
`
}

// ── Vault writer ─────────────────────────────────────────────────────────────

export interface VaultWriteResult {
  guidelines: number
  sources: number
  tricks: number
  skipped: number
  errors: string[]
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

export function writeToVault(
  vaultPath: string,
  data: {
    guidelines: DbGuideline[]
    sources: DbSource[]
    tricks: DbTrick[]
    guidelineMap: Map<string, DbGuideline>
    sourcesByGuideline: Map<string, DbSource[]>
    sourcesByTrick: Map<string, DbSource[]>
    sourceByPaperId: Map<string, DbSource>
  },
): VaultWriteResult {
  const result: VaultWriteResult = { guidelines: 0, sources: 0, tricks: 0, skipped: 0, errors: [] }

  const guideDir = join(vaultPath, 'Guidelines')
  const sourceDir = join(vaultPath, 'Sources')
  const trickDir = join(vaultPath, 'Tricks')
  ensureDir(guideDir)
  ensureDir(sourceDir)
  ensureDir(trickDir)

  // Write guidelines
  for (const g of data.guidelines) {
    try {
      const sources = data.sourcesByGuideline.get(g.id) ?? []
      let relatedTrickIds: string[] = []
      const trickTitles: string[] = []
      for (const trick of data.tricks) {
        try { relatedTrickIds = JSON.parse(trick.related_guideline_ids) } catch { /* */ }
        if (relatedTrickIds.includes(g.id)) {
          trickTitles.push(
            trick.content.length > 80 ? trick.content.slice(0, 80) + '…' : trick.content,
          )
        }
      }
      const md = guidelineToMarkdown(g, sources, trickTitles)
      writeFileSync(join(guideDir, `${safeFilename(g.title)}.md`), md, 'utf-8')
      result.guidelines++
    } catch (e) {
      result.errors.push(`guideline "${g.title}": ${String(e)}`)
    }
  }

  // Write sources
  const allSources = data.sources
  for (const s of allSources) {
    try {
      // Guidelines that reference this source
      const guidelineTitles = s.guideline_id
        ? [data.guidelineMap.get(s.guideline_id)?.title].filter(Boolean) as string[]
        : []

      // Paper → paper from citation_edges (passed in sourceByPaperId lookup)
      // These are handled by the caller enriching the source if needed
      const md = sourceToMarkdown(s, guidelineTitles, [], [])
      writeFileSync(join(sourceDir, `${safeFilename(s.title)}.md`), md, 'utf-8')
      result.sources++
    } catch (e) {
      result.errors.push(`source "${s.title}": ${String(e)}`)
    }
  }

  // Write tricks
  for (const t of data.tricks) {
    try {
      const sources = data.sourcesByTrick.get(t.id) ?? []
      let relatedIds: string[] = []
      try { relatedIds = JSON.parse(t.related_guideline_ids) } catch { /* */ }
      const relatedTitles = relatedIds
        .map((id) => data.guidelineMap.get(id)?.title)
        .filter(Boolean) as string[]

      const displayTitle = t.content.length > 80
        ? t.content.slice(0, 80).trimEnd() + '…'
        : t.content
      const md = trickToMarkdown(t, relatedTitles, sources)
      writeFileSync(join(trickDir, `${safeFilename('Tip ' + displayTitle)}.md`), md, 'utf-8')
      result.tricks++
    } catch (e) {
      result.errors.push(`trick ${t.id}: ${String(e)}`)
    }
  }

  // Dashboard
  try {
    const idx = indexMarkdown({
      guidelines: result.guidelines,
      sources: result.sources,
      tricks: result.tricks,
      generatedAt: new Date().toISOString(),
    })
    writeFileSync(join(vaultPath, '_index.md'), idx, 'utf-8')
  } catch (e) {
    result.errors.push(`index: ${String(e)}`)
  }

  return result
}
