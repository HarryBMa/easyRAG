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
  { value: '', label: 'All' },
  { value: 'airway_management', label: 'Airway' },
  { value: 'cardiac', label: 'Cardiac' },
  { value: 'obstetric', label: 'Obstetric' },
  { value: 'pediatric', label: 'Pediatric' },
  { value: 'pain_management', label: 'Pain' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'general', label: 'General' },
]

const STATUS_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'flagged', label: 'Flagged' },
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
      return fetch(`/api/guidelines?${params}`).then((r) => r.json())
    },
  })

  return (
    <PageShell
      title="Guidelines"
      subtitle={`${guidelines.length} protocols · sorted by ${sort}`}
      action={
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#0284c7' }}
        >
          + Upload Guideline
        </button>
      }
    >
      {showUpload && (
        <UploadGuideline
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false)
            refetch()
          }}
        />
      )}

      {/* Filters */}
      <div
        className="px-8 py-3 flex items-center gap-6"
        style={{ borderBottom: '1px solid #1e2d4a' }}
      >
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === t.value
                  ? 'bg-sky-600/20 text-sky-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-800" />

        {/* Category pills */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                category === c.value
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs text-slate-400 bg-transparent border border-slate-700 rounded-lg px-2 py-1.5"
          >
            <option value="trending">Trending</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="p-8">
        {guidelines.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-slate-400 font-medium">No guidelines yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Upload a protocol to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {guidelines.map((g) => (
              <GuidelineCard
                key={g.id}
                guideline={g}
                onDeleted={refetch}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
