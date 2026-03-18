import { Link } from '@tanstack/react-router'
import { ConfidenceBadge } from './ConfidenceBadge'
import { StatusBadge } from './StatusBadge'

interface Guideline {
  id: string
  title: string
  hospital: string
  category: string
  structured: {
    drugs?: { name: string }[]
    steps?: string[]
    indications?: string[]
  }
  confidence_score: number
  source_quality: number
  status: string
  upvotes: number
  downvotes: number
  pubmed_count: number
  created_at: string
}

const CAT_LABELS: Record<string, string> = {
  airway_management: 'Airway',
  cardiac: 'Cardiac',
  obstetric: 'OB',
  pediatric: 'Peds',
  pain_management: 'Pain',
  emergency: 'Emergency',
  general: 'General',
}

interface Props {
  guideline: Guideline
  onDeleted?: () => void
}

export function GuidelineCard({ guideline: g, onDeleted }: Props) {
  const deleteGuideline = async () => {
    if (!confirm(`Delete "${g.title}"?`)) return
    await fetch('/api/guidelines', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: g.id }),
    })
    onDeleted?.()
  }

  const drugs = g.structured?.drugs?.slice(0, 3) ?? []
  const stepCount = g.structured?.steps?.length ?? 0

  return (
    <Link
      to="/guidelines/$id"
      params={{ id: g.id }}
      className="block rounded-xl p-5 hover:border-sky-500/40 transition-all group relative"
      style={{ background: '#111827', border: '1px solid #1e2d4a' }}
    >
      {/* Delete button */}
      <button
        onClick={(e) => {
          e.preventDefault()
          deleteGuideline()
        }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-700
          hover:text-red-400 transition-all text-xs"
      >
        ✕
      </button>

      {/* Header */}
      <div className="flex items-start gap-2 mb-3 pr-6">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2">
            {g.title}
          </p>
          {g.hospital && (
            <p className="text-xs text-slate-500 mt-0.5">{g.hospital}</p>
          )}
        </div>
      </div>

      {/* Category + status */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ background: '#0284c720', color: '#38bdf8' }}
        >
          {CAT_LABELS[g.category] ?? g.category}
        </span>
        <StatusBadge status={g.status} />
      </div>

      {/* Drugs preview */}
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {drugs.map((d) => (
            <span
              key={d.name}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: '#0d9488/15', color: '#5eead4', border: '1px solid #0d948830' }}
            >
              {d.name}
            </span>
          ))}
          {(g.structured?.drugs?.length ?? 0) > 3 && (
            <span className="text-[10px] text-slate-600">
              +{(g.structured?.drugs?.length ?? 0) - 3} more
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <ConfidenceBadge score={g.confidence_score} compact />
        <div className="flex items-center gap-3 text-xs text-slate-600">
          {g.pubmed_count > 0 && (
            <span className="text-sky-600">📄 {g.pubmed_count}</span>
          )}
          {stepCount > 0 && <span>{stepCount} steps</span>}
          <span>↑ {g.upvotes}</span>
        </div>
      </div>
    </Link>
  )
}
