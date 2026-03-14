import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageShell } from './__root'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { StatusBadge } from '../components/StatusBadge'

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
  research_gaps: { id: string; content: string; hospital_count: number; study_count: number }[]
  flagged: { id: string; title: string; confidence_score: number; status: string }[]
}

function DashboardPage() {
  const { data } = useQuery<TrendData>({
    queryKey: ['trends'],
    queryFn: () => fetch('/api/trends').then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const stats = data?.stats

  return (
    <PageShell
      title="Dashboard"
      subtitle="Real-time overview of your anesthesia knowledge base"
    >
      <div className="p-8 space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Guidelines"
            value={stats?.total_guidelines ?? '—'}
            icon="📋"
            color="#0284c7"
          />
          <StatCard
            label="Avg Confidence"
            value={
              stats?.avg_confidence != null
                ? `${(stats.avg_confidence * 100).toFixed(0)}%`
                : '—'
            }
            icon="🎯"
            color="#0d9488"
          />
          <StatCard
            label="Flagged"
            value={stats?.flagged_count ?? '—'}
            icon="⚠️"
            color="#d97706"
          />
          <StatCard
            label="Needs Review"
            value={stats?.review_count ?? '—'}
            icon="🔍"
            color="#7c3aed"
          />
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Category breakdown */}
          <div
            className="col-span-2 rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1e2d4a' }}
          >
            <h2 className="text-sm font-semibold text-slate-300 mb-4">
              Guidelines by Category
            </h2>
            <div className="space-y-2.5">
              {(data?.by_category ?? []).map((cat) => (
                <CategoryRow key={cat.category} {...cat} />
              ))}
              {!data && (
                <p className="text-sm text-slate-600">Loading…</p>
              )}
            </div>
          </div>

          {/* Research Gaps */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1e2d4a' }}
          >
            <h2 className="text-sm font-semibold text-slate-300 mb-1">
              Research Opportunities
            </h2>
            <p className="text-xs text-slate-600 mb-4">
              Multi-hospital tricks with no studies
            </p>
            <div className="space-y-3">
              {(data?.research_gaps ?? []).slice(0, 5).map((gap) => (
                <div key={gap.id}>
                  <p className="text-xs text-slate-300 leading-snug">
                    {gap.content.slice(0, 80)}…
                  </p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] text-teal-400">
                      {gap.hospital_count} hospitals
                    </span>
                    <span className="text-[10px] text-slate-600">
                      0 studies
                    </span>
                  </div>
                </div>
              ))}
              {!data?.research_gaps?.length && (
                <p className="text-xs text-slate-600">No gaps identified yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Flagged / needs review */}
        {(data?.flagged?.length ?? 0) > 0 && (
          <div
            className="rounded-xl p-5"
            style={{ background: '#1a1222', border: '1px solid #3b1e2d' }}
          >
            <h2 className="text-sm font-semibold text-amber-400 mb-4">
              ⚠️ Flagged Guidelines — Needs Attention
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {(data?.flagged ?? []).map((g) => (
                <Link
                  key={g.id}
                  to="/guidelines/$id"
                  params={{ id: g.id }}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ border: '1px solid #3b1e2d' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{g.title}</p>
                    <StatusBadge status={g.status} />
                  </div>
                  <ConfidenceBadge score={g.confidence_score} compact />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: string | number
  icon: string
  color: string
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#111827', border: '1px solid #1e2d4a' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

function CategoryRow({
  category,
  count,
  avg_confidence,
}: {
  category: string
  count: number
  avg_confidence: number
}) {
  const LABELS: Record<string, string> = {
    airway_management: 'Airway Management',
    cardiac: 'Cardiac',
    obstetric: 'Obstetric',
    pediatric: 'Pediatric',
    pain_management: 'Pain Management',
    emergency: 'Emergency',
    general: 'General',
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-32 shrink-0">
        {LABELS[category] ?? category}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, count * 10)}%`,
            background:
              avg_confidence > 0.7
                ? '#0d9488'
                : avg_confidence > 0.4
                  ? '#d97706'
                  : '#dc2626',
          }}
        />
      </div>
      <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
    </div>
  )
}
