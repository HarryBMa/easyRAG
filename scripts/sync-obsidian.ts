#!/usr/bin/env tsx
/**
 * easyRAG → Obsidian vault sync
 *
 * Reads all guidelines, sources, and tricks from the database and writes
 * them as wikilinked markdown files into your Obsidian vault.
 *
 * Usage:
 *   OBSIDIAN_VAULT_PATH=/path/to/vault npx tsx scripts/sync-obsidian.ts
 *
 *   # or with .env:
 *   cp .env.example .env  # set OBSIDIAN_VAULT_PATH=...
 *   npm run sync:obsidian
 *
 *   # Watch mode (re-syncs every 30 s):
 *   npm run sync:obsidian -- --watch
 *
 * The vault path can also be set in .env as OBSIDIAN_VAULT_PATH.
 *
 * After syncing, open the vault folder in Obsidian and install the
 * free "Dataview" plugin to enable the dashboard queries in _index.md.
 *
 * Graph tips:
 *   - Open Graph View (Ctrl/Cmd + G)
 *   - Filter to "Guidelines" folder to see guideline ↔ source edges
 *   - Color nodes by tag: evidence-backed (green), has-contradictions (red)
 *   - Node size by citation_count (requires Dataview + Graph Analysis plugins)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { getDb, initDb } from '../lib/turso'
import {
  writeToVault,
  type DbGuideline,
  type DbSource,
  type DbTrick,
} from '../lib/obsidian'

config()  // load .env

// ── Config ────────────────────────────────────────────────────────────────────

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH
const WATCH_MODE = process.argv.includes('--watch')
const WATCH_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS ?? '30000', 10)

if (!VAULT_PATH) {
  console.error(
    '\n❌  OBSIDIAN_VAULT_PATH is not set.\n' +
    '    Add it to your .env file or export it before running:\n\n' +
    '    OBSIDIAN_VAULT_PATH=/Users/you/Documents/easyRAG-vault npm run sync:obsidian\n',
  )
  process.exit(1)
}

const vaultPath = resolve(VAULT_PATH)

// ── DB fetch helpers ──────────────────────────────────────────────────────────

async function fetchAll() {
  const db = getDb()

  const [gRes, sRes, tRes] = await Promise.all([
    db.execute(`SELECT * FROM guidelines ORDER BY updated_at DESC`),
    db.execute(`SELECT * FROM sources ORDER BY citation_count DESC`),
    db.execute(`SELECT * FROM tricks ORDER BY upvotes DESC`),
  ])

  const guidelines = gRes.rows as unknown as DbGuideline[]
  const sources = sRes.rows as unknown as DbSource[]
  const tricks = tRes.rows as unknown as DbTrick[]

  // Build lookup maps
  const guidelineMap = new Map(guidelines.map((g) => [g.id, g]))

  const sourcesByGuideline = new Map<string, DbSource[]>()
  const sourcesByTrick = new Map<string, DbSource[]>()
  const sourceByPaperId = new Map<string, DbSource>()

  for (const s of sources) {
    if (s.guideline_id) {
      const arr = sourcesByGuideline.get(s.guideline_id) ?? []
      arr.push(s)
      sourcesByGuideline.set(s.guideline_id, arr)
    }
    if (s.trick_id) {
      const arr = sourcesByTrick.get(s.trick_id) ?? []
      arr.push(s)
      sourcesByTrick.set(s.trick_id, arr)
    }
    const paperId = s.semantic_scholar_id ?? s.pubmed_id ?? s.id
    if (paperId) sourceByPaperId.set(paperId, s)
  }

  return { guidelines, sources, tricks, guidelineMap, sourcesByGuideline, sourcesByTrick, sourceByPaperId }
}

// ── Sync runner ───────────────────────────────────────────────────────────────

async function sync() {
  const start = Date.now()

  if (!existsSync(vaultPath)) {
    console.error(`\n❌  Vault path does not exist: ${vaultPath}\n    Create the folder and open it in Obsidian first.\n`)
    if (!WATCH_MODE) process.exit(1)
    return
  }

  let data: Awaited<ReturnType<typeof fetchAll>>
  try {
    data = await fetchAll()
  } catch (err) {
    console.error('❌  DB fetch failed:', err)
    return
  }

  const result = writeToVault(vaultPath, data)

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(
    `✅  Synced to ${vaultPath}\n` +
    `    ${result.guidelines} guidelines  ·  ${result.sources} sources  ·  ${result.tricks} tricks\n` +
    `    ${elapsed}s${result.errors.length ? `  ·  ⚠️  ${result.errors.length} errors` : ''}`,
  )

  if (result.errors.length) {
    console.warn('\nErrors:')
    result.errors.forEach((e) => console.warn('  -', e))
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔗  easyRAG → Obsidian sync`)
  console.log(`    Vault: ${vaultPath}`)
  if (WATCH_MODE) console.log(`    Watch mode: every ${WATCH_INTERVAL_MS / 1000}s\n`)
  else console.log('')

  await initDb()
  await sync()

  if (WATCH_MODE) {
    setInterval(sync, WATCH_INTERVAL_MS)
    console.log('\n    Watching for changes. Press Ctrl+C to stop.\n')
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
