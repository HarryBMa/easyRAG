import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { PageShell } from '../__root'
import { TrickCard } from '../../components/TrickCard'

export const Route = createFileRoute('/tricks/')({
  component: TricksPage,
})

interface Trick {
  id: string
  content: string
  author: string
  hospital: string
  category: string
  upvotes: number
  downvotes: number
  hospital_count: number
  study_count: number
  badges: string[]
  created_at: string
}

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

function TricksPage() {
  const qc = useQueryClient()
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('top')
  const [showForm, setShowForm] = useState(false)

  const { data: tricks = [] } = useQuery<Trick[]>({
    queryKey: ['tricks', category, sort],
    queryFn: () => {
      const p = new URLSearchParams({ sort })
      if (category) p.set('category', category)
      return fetch(`/api/tricks?${p}`).then((r) => r.json())
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tricks'] })

  return (
    <PageShell
      title="Tricks of the Trade"
      subtitle="Crowd-sourced clinical tips from anesthesiologists worldwide"
      action={
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#0d9488' }}
        >
          + Share a Trick
        </button>
      }
    >
      {showForm && (
        <SubmitTrickModal
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false)
            invalidate()
          }}
        />
      )}

      {/* Filters */}
      <div
        className="px-8 py-3 flex items-center gap-4"
        style={{ borderBottom: '1px solid #1e2d4a' }}
      >
        <div className="flex gap-1">
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
            <option value="top">Top Rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div className="p-8">
        {tricks.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-3">💡</p>
            <p className="text-slate-400 font-medium">No tricks yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Share your first clinical tip
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {tricks.map((trick) => (
              <TrickCard key={trick.id} trick={trick} onVote={invalidate} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

function SubmitTrickModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [hospital, setHospital] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!content.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tricks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, author, hospital }),
      })
      if (!res.ok) throw new Error('Failed to submit')
      onSuccess()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-4"
        style={{ background: '#111827', border: '1px solid #1e2d4a' }}
      >
        <h2 className="text-lg font-bold text-slate-100">Share a Clinical Trick</h2>
        <p className="text-sm text-slate-500">
          Unverified but practical tips — upvotes from colleagues help surface the best ones.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. For Grade 4 airways, a bougie + 60° blade angle reliably improves view…"
          rows={4}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
            text-sm text-slate-200 placeholder-slate-600 outline-none
            focus:border-sky-500 resize-none transition-colors"
        />

        <div className="grid grid-cols-2 gap-3">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5
              text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
          />
          <input
            value={hospital}
            onChange={(e) => setHospital(e.target.value)}
            placeholder="Hospital (optional)"
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5
              text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!content.trim() || loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-colors"
            style={{ background: '#0d9488' }}
          >
            {loading ? 'Submitting…' : 'Submit Trick'}
          </button>
        </div>
      </div>
    </div>
  )
}
