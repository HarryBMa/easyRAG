import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { PageShell } from './__root'
import { ECGBackground } from '../components/ECGBackground'

function useCountUp(target: number | undefined, duration = 900) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null) return
    setValue(0)
    const start = Date.now()
    const tick = () => {
      const progress = Math.min((Date.now() - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4) // ease-out-quart
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return value
}

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

interface TrendData {
  stats: {
    total_guidelines: number
    avg_confidence: number
    flagged_count: number
    review_count: number
  }
  by_category: { category: string; count: number; avg_confidence: number }[]
  flagged: { id: string; title: string; confidence_score: number; status: string }[]
}

const CAT_COLORS: Record<string, string> = {
  airway_management: '#00d4ff',
  cardiac:           '#ff3355',
  obstetric:         '#00ff88',
  pediatric:         '#ffaa00',
  pain_management:   '#a78bfa',
  emergency:         '#ff6633',
  general:           '#4a6585',
}

const CAT_LABELS: Record<string, string> = {
  airway_management: 'Airway Mgmt',
  cardiac:           'Cardiac',
  obstetric:         'Obstetric',
  pediatric:         'Pediatric',
  pain_management:   'Pain Mgmt',
  emergency:         'Emergency',
  general:           'General',
}

function DashboardPage() {
  const { data } = useQuery<TrendData>({
    queryKey: ['trends'],
    queryFn: () => fetch('/api/trends').then(r => r.json()),
    refetchInterval: 30_000,
  })

  const s = data?.stats

  return (
    <div className="relative h-full overflow-hidden">
      <ECGBackground
        avgConfidence={s?.avg_confidence}
        flaggedCount={s?.flagged_count ?? 0}
      />
    <PageShell title="Dashboard" subtitle="KNOWLEDGE BASE · REAL-TIME OVERVIEW">
      <div className="relative p-8 space-y-6" style={{ zIndex: 1 }}>

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="PROTOCOLS"  value={s?.total_guidelines}  color="#00d4ff" delay={0} />
          <StatCard
            label="AVG CONF."
            value={s?.avg_confidence != null ? `${(s.avg_confidence * 100).toFixed(0)}%` : undefined}
            color="#00ff88"
            delay={1}
          />
          <StatCard label="FLAGGED"    value={s?.flagged_count}     color="#ff3355" delay={2} />
          <StatCard label="REVIEW"     value={s?.review_count}      color="#ffaa00" delay={3} />
        </div>

        {/* Category breakdown — full width, research gaps live in Trends */}
        <div
          className="rounded-xl p-5 fade-up delay-2"
          style={{ background: '#0d1a2e', border: '1px solid rgba(0,212,255,0.08)' }}
        >
          <p className="type-label font-semibold uppercase mb-5" style={{ color: '#1e3650' }}>
            PROTOCOLS BY CATEGORY
          </p>
          <div className="space-y-3.5">
            {(data?.by_category ?? []).map((cat, i) => (
              <CategoryRow key={cat.category} {...cat} index={i} />
            ))}
            {!data && (
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'var(--text-label)', color: '#1e3650' }}>
                LOADING…
              </p>
            )}
            {data && data.by_category.length === 0 && (
              <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'var(--text-label)', color: '#1e3650' }}>
                NO DATA YET
              </p>
            )}
          </div>
        </div>

        {/* Flagged */}
        {(data?.flagged?.length ?? 0) > 0 && (
          <div
            className="rounded-xl p-5 fade-up delay-4"
            style={{ background: 'rgba(255,51,85,0.03)', border: '1px solid rgba(255,51,85,0.1)' }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{
                background: '#ff3355',
                boxShadow: '0 0 5px #ff3355',
              }} />
              <p className="text-[9px] font-semibold tracking-[0.14em]" style={{
                fontFamily: "'IBM Plex Mono', monospace",
                color: '#ff3355',
              }}>
                FLAGGED · NEEDS ATTENTION
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(data?.flagged ?? []).map(g => {
                const confColor = g.confidence_score < 0.4 ? '#ff3355' : g.confidence_score < 0.7 ? '#ffaa00' : '#00ff88'
                return (
                  <Link
                    key={g.id}
                    to="/guidelines/$id"
                    params={{ id: g.id }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                    style={{ background: 'rgba(255,51,85,0.03)', border: '1px solid rgba(255,51,85,0.09)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,51,85,0.22)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,51,85,0.09)'}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate" style={{ fontFamily: "'Syne', sans-serif", color: '#c8d8eb' }}>
                        {g.title}
                      </p>
                      <p className="text-[9px] mt-0.5 tracking-[0.06em]" style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: '#ff335570',
                      }}>
                        {g.status.toUpperCase().replace('_', ' ')}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold shrink-0" style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: confColor,
                    }}>
                      {Math.round(g.confidence_score * 100)}%
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </PageShell>
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  delay,
}: {
  label: string
  value?: string | number
  color: string
  delay: number
}) {
  const rawNum = typeof value === 'number' ? value : undefined
  const counted = useCountUp(rawNum, 900 + delay * 100)
  const displayed = typeof value === 'string' ? value : (rawNum != null ? counted : undefined)
  const delayClass = ['fade-up', 'fade-up delay-1', 'fade-up delay-2', 'fade-up delay-3'][delay] ?? 'fade-up'

  return (
    <div
      className={`relative rounded-xl p-5 overflow-hidden ${delayClass}`}
      style={{ background: '#0d1a2e', border: `1px solid ${color}12` }}
    >
      <div className="stat-sweep" />
      <p className="type-label font-semibold mb-3" style={{ color: '#1e3650' }}>
        {label}
      </p>
      <p className="type-stat font-bold leading-none" style={{
        fontSize: 'var(--text-stat)',
        color: displayed != null ? color : '#1a2d44',
      }}>
        {displayed ?? '—'}
      </p>
    </div>
  )
}

function CategoryRow({
  category,
  count,
  avg_confidence,
  index,
}: {
  category: string
  count: number
  avg_confidence: number
  index: number
}) {
  const barColor = avg_confidence > 0.7 ? '#00ff88' : avg_confidence > 0.4 ? '#ffaa00' : '#ff3355'
  const catColor = CAT_COLORS[category] ?? '#4a6585'
  const MAX = 20
  const barPct = `${Math.min(100, (count / MAX) * 100)}%`

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] w-[100px] shrink-0" style={{
        fontFamily: "'IBM Plex Mono', monospace",
        color: '#2d4a68',
      }}>
        {CAT_LABELS[category] ?? category}
      </span>
      <div className="flex-1 h-px rounded-full overflow-hidden" style={{ background: 'rgba(0,212,255,0.05)' }}>
        <div
          className="h-full rounded-full fill-bar"
          style={{
            '--bar-w': barPct,
            animationDelay: `${200 + index * 80}ms`,
            background: barColor,
            boxShadow: `0 0 5px ${barColor}55`,
          } as React.CSSProperties}
        />
      </div>
      <span className="text-[10px] w-5 text-right font-bold" style={{
        fontFamily: "'IBM Plex Mono', monospace",
        color: catColor,
      }}>
        {count}
      </span>
    </div>
  )
}
