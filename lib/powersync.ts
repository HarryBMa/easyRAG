'use client'

/**
 * PowerSync client — syncs guidelines, tricks, and sources to an in-browser
 * SQLite database (OPFS-backed) for offline-first access.
 *
 * Auth integration: PowerSync is fed the Supabase JWT so users only
 * receive data they're allowed to sync (controlled via sync-rules.yaml).
 *
 * Requires env vars (set in .env):
 *   VITE_POWERSYNC_URL      — Your PowerSync instance URL
 *   VITE_SUPABASE_URL       — Supabase project URL
 *   VITE_SUPABASE_ANON_KEY  — Supabase anon key
 *
 * Without VITE_POWERSYNC_URL the app falls back to direct REST API calls.
 */

import {
  PowerSyncDatabase,
  WASQLiteOpenFactory,
  column,
  Schema,
  Table,
  type AbstractPowerSyncDatabase,
} from '@powersync/web'
import { getBrowserClient } from './auth'

const guidelines = new Table({
  title: column.text,
  hospital: column.text,
  category: column.text,
  structured_json: column.text,
  confidence_score: column.real,
  source_quality: column.real,
  status: column.text,
  upvotes: column.integer,
  downvotes: column.integer,
  pubmed_count: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

const tricks = new Table({
  content: column.text,
  author: column.text,
  hospital: column.text,
  category: column.text,
  upvotes: column.integer,
  downvotes: column.integer,
  hospital_count: column.integer,
  study_count: column.integer,
  badges: column.text,
  related_guideline_ids: column.text,
  created_at: column.text,
})

const sources = new Table({
  guideline_id: column.text,
  pubmed_id: column.text,
  title: column.text,
  authors: column.text,
  journal: column.text,
  year: column.integer,
  relevance_score: column.real,
  url: column.text,
})

export const AppSchema = new Schema({ guidelines, tricks, sources })
export type AppDatabase = (typeof AppSchema)['types']

let _db: AbstractPowerSyncDatabase | null = null

export function getPowerSyncDb(): AbstractPowerSyncDatabase {
  if (_db) return _db

  _db = new PowerSyncDatabase({
    schema: AppSchema,
    database: new WASQLiteOpenFactory({ dbFilename: 'protocolsync.db' }),
  })

  const psUrl = import.meta.env.VITE_POWERSYNC_URL as string | undefined

  if (psUrl) {
    _db.connect({
      fetchCredentials: async () => {
        // Use the live Supabase session JWT as the PowerSync token.
        // This ties PowerSync auth to the same identity as the app.
        const supabase = getBrowserClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) throw new Error('Not authenticated')

        return {
          endpoint: psUrl,
          token: session.access_token,
          expiresAt: new Date(session.expires_at! * 1000),
        }
      },
    } as never)
  }

  return _db
}
