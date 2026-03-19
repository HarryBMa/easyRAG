import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PageShell } from '../__root'
import { GuidelineCard } from '../../components/GuidelineCard'
import { UploadGuideline } from '../../components/UploadGuideline'

export const Route = createFileRoute('/guidelines/')({
  component: GuidelinesPage,
})

const CATEGORIES = [
  { value: '',                 label: 'ALL' },
  { value: 'airway_management', label: 'AIRWAY' },
  { value: 'cardiac',           label: 'CARDIAC' },
  { value: 'obstetric',         label: 'OB' },
  { value: 'pediatric',         label: 'PEDS' },
  { value: 'pain_management',   label: 'PAIN' },
  { value: 'emergency',         label: 'EMERG' },
  { value: 'general',           label: 'GEN' },
]

const STATUS_TABS = [
  { value: 'active',        label: 'ACTIVE' },
  { value: 'needs_review',  label: 'REVIEW' },
  { value: 'flagged',       label: 'FLAGGED' },
]

interface Guideline {
  id: string
  title: string
  hospital: string
  category: string
  structured: Record<string, unknown>
  confidence_score: number
  source_quality: number
  status: string
  upvotes: number
  downvotes: number
  pubmed_count: number
  created_at: string
  trending_score: number
}

function GuidelinesPage() {
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('active')
  const [sort, setSort] = useState('trending')
  const [showUpload, setShowUpload] = useState(false)

  const { data: guidelines = [], refetch } = useQuery<Guideline[]>({
    queryKey: ['guidelines', category, status, sort],
    queryFn: () => {
      const params = new URLSearchParams({ status, sort })
      if (category) params.set('category', category)
      return fetch(`/api/guidelines?${params}`).then(r => r.json())
    },
  })

  return (
    <PageShell
      title="Protocols"
      subtitle={`${guidelines.length} PROTOCOLS · SORT: ${sort.toUpperCase()}`}
      action={
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[10px] font-semibold tracking-[0.08em] transition-all"
          style={{
            background: 'rgba(0,212,255,0.07)',
            border: '1px solid rgba(0,212,255,0.18)',
            color: '#00d4ff',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.13)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.07)'}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="4.5" y1="1" x2="4.5" y2="8" />
            <line x1="1" y1="4.5" x2="8" y2="4.5" />
          </svg>
          UPLOAD
        </button>
      }
    >
      {showUpload && (
        <UploadGuideline
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); refetch() }}
        />
      )}

      {/* Filter bar */}
      <div
        className="px-8 py-3 flex items-center gap-4 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,212,255,0.06)' }}
      >
        {/* Status tabs */}
        <div className="flex gap-px">
          {STATUS_TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className="px-3 py-1.5 text-[9px] font-semibold tracking-[0.1em] transition-all rounded-md"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                background: status === t.value ? 'rgba(0,212,255,0.07)' : 'transparent',
                color: status === t.value ? '#00d4ff' : '#1e3650',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4" style={{ background: 'rgba(0,212,255,0.07)' }} />

        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className="cat-pill transition-all"
              style={{
                background: category === c.value ? 'rgba(0,212,255,0.09)' : 'transparent',
                color: category === c.value ? '#00d4ff' : '#1e3650',
                border: category === c.value ? '1px solid rgba(0,212,255,0.18)' : '1px solid transparent',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSort(s => s === 'trending' ? 'newest' : 'trending')}
          className="ml-auto flex items-center gap-1.5 transition-colors"
          title={`Sort: ${sort} — click to toggle`}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 'var(--text-label)',
            letterSpacing: '0.08em',
            color: sort === 'newest' ? '#00d4ff' : '#1e3650',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#3d5a76'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = sort === 'newest' ? '#00d4ff' : '#1e3650'}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <line x1="1" y1="2" x2="8" y2="2" />
            <line x1="1" y1="4.5" x2="6" y2="4.5" />
            <line x1="1" y1="7" x2="4" y2="7" />
          </svg>
          {sort.toUpperCase()}
        </button>
      </div>

      {/* Grid */}
      <div className="p-8 overflow-y-auto">
        {guidelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="rgba(0,212,255,0.1)" strokeWidth="1.2" className="mb-4">
              <rect x="5" y="5" width="26" height="26" rx="3" />
              <line x1="10" y1="13" x2="26" y2="13" />
              <line x1="10" y1="18" x2="21" y2="18" />
              <line x1="10" y1="23" x2="16" y2="23" />
            </svg>
            <p className="text-[10px] tracking-[0.12em]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#1e3650' }}>
              NO PROTOCOLS
            </p>
            <p className="text-[9px] mt-1 tracking-wide" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#0f2035' }}>
              Upload a document to begin
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {guidelines.map((g, i) => (
              <div key={g.id} className={`fade-up delay-${Math.min(i + 1, 5)}`}>
                <GuidelineCard guideline={g} onDeleted={refetch} />
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
