import { Link } from '@tanstack/react-router'

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

interface Props {
  guideline: Guideline
  onDeleted?: () => void
}

const CAT_CONFIG: Record<string, { label: string; color: string }> = {
  airway_management: { label: 'AIRWAY',  color: '#00d4ff' },
  cardiac:           { label: 'CARDIAC', color: '#ff3355' },
  obstetric:         { label: 'OB',      color: '#00ff88' },
  pediatric:         { label: 'PEDS',    color: '#ffaa00' },
  pain_management:   { label: 'PAIN',    color: '#a78bfa' },
  emergency:         { label: 'EMERG',   color: '#ff6633' },
  general:           { label: 'GEN',     color: '#4a6585' },
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  active:       { color: '#00ff88', label: 'ACTIVE' },
  needs_review: { color: '#ffaa00', label: 'REVIEW' },
  flagged:      { color: '#ff3355', label: 'FLAGGED' },
  processing:   { color: '#00d4ff', label: 'PROC…' },
  error:        { color: '#ff3355', label: 'ERROR' },
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
  const cat   = CAT_CONFIG[g.category]     ?? { label: g.category.slice(0, 6).toUpperCase(), color: '#4a6585' }
  const status  = STATUS_CONFIG[g.status]    ?? { color: '#4a6585', label: g.status.toUpperCase() }
  const confPct = Math.round(g.confidence_score * 100)
  const confColor = g.confidence_score >= 0.7 ? '#00ff88' : g.confidence_score >= 0.4 ? '#ffaa00' : '#ff3355'

  return (
    <Link
      to="/guidelines/$id"
      params={{ id: g.id }}
      className="block rounded-xl p-4 card-lift group relative h-full"
      style={{ background: '#0d1a2e', border: '1px solid rgba(0,212,255,0.07)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.2)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.07)'}
    >
      {/* Delete button */}
      <button
        onClick={e => { e.preventDefault(); deleteGuideline() }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all w-5 h-5 flex items-center justify-center rounded"
        style={{ color: '#2d4a68' }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ff3355'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#2d4a68'}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="1" y1="1" x2="7" y2="7" />
          <line x1="7" y1="1" x2="1" y2="7" />
        </svg>
      </button>

      {/* Category + Status */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="cat-pill"
          style={{
            background: `${cat.color}12`,
            color: cat.color,
            border: `1px solid ${cat.color}22`,
          }}
        >
          {cat.label}
        </span>
        <span
          className="text-[9px] tracking-[0.08em]"
          style={{ fontFamily: "'IBM Plex Mono', monospace", color: status.color, opacity: 0.75 }}
        >
          {status.label}
        </span>
      </div>

      {/* Title */}
      <p className="type-body font-semibold line-clamp-2 mb-2 pr-4" style={{
        fontSize: 'var(--text-body)',
        color: '#c8d8eb',
      }}>
        {g.title}
      </p>

      {/* Hospital */}
      {g.hospital && (
        <p className="text-[9px] mb-3 tracking-[0.07em]" style={{
          fontFamily: "'IBM Plex Mono', monospace",
          color: '#1e3650',
        }}>
          {g.hospital.toUpperCase()}
        </p>
      )}

      {/* Drug tags */}
      {drugs.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {drugs.map(d => (
            <span key={d.name} className="text-[9px] px-1.5 py-0.5 rounded" style={{
              fontFamily: "'IBM Plex Mono', monospace",
              background: 'rgba(0,255,136,0.05)',
              color: 'rgba(0,255,136,0.55)',
              border: '1px solid rgba(0,255,136,0.1)',
            }}>
              {d.name}
            </span>
          ))}
          {(g.structured?.drugs?.length ?? 0) > 3 && (
            <span className="text-[9px]" style={{
              fontFamily: "'IBM Plex Mono', monospace",
              color: '#1e3650',
            }}>
              +{(g.structured.drugs!.length) - 3}
            </span>
          )}
        </div>
      )}

      {/* Confidence bar — animated fill */}
      <div className="mb-3">
        <div className="h-px w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,212,255,0.06)' }}>
          <div
            className="h-full rounded-full fill-bar"
            style={{
              '--bar-w': `${confPct}%`,
              animationDelay: '100ms',
              background: confColor,
              boxShadow: `0 0 4px ${confColor}55`,
            } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="tabular font-bold" style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 'var(--text-label)',
          color: confColor,
        }}>
          {confPct}%
        </span>
        {g.pubmed_count > 0 && (
          <span style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 'var(--text-label)',
            color: '#2d4a68',
          }}>
            {g.pubmed_count} refs
          </span>
        )}
      </div>
    </Link>
  )
}
