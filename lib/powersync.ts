'use client'

/**
 * PowerSync client — syncs guidelines, tricks, and sources to an in-browser
 * SQLite database (OPFS-backed) for offline-first access.
 *
 * Requires env vars (set in .env):
 *   VITE_POWERSYNC_URL    — Your PowerSync instance URL
 *   VITE_POWERSYNC_TOKEN  — Static dev token or JWT endpoint
 *
 * Without these the app falls back to direct REST API calls.
 */

import {
  PowerSyncDatabase,
  WASQLiteOpenFactory,
  column,
  Schema,
  Table,
  type AbstractPowerSyncDatabase,
} from '@powersync/web'

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
  const psToken = import.meta.env.VITE_POWERSYNC_TOKEN as string | undefined

  if (psUrl && psToken) {
    _db.connect({
      fetchCredentials: async () => ({ endpoint: psUrl, token: psToken }),
    } as never)
  }

  return _db
}
