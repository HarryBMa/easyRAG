import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageShell } from '../__root'
import { ConfidenceBadge } from '../../components/ConfidenceBadge'

export const Route = createFileRoute('/trends/')({
  component: TrendsPage,
})

interface TrendData {
  stats: {
    total_guidelines: number
    avg_confidence: number
    flagged_count: number
    review_count: number
  }
  by_category: {
    category: string
    count: number
    avg_confidence: number
    total_upvotes: number
  }[]
  research_gaps: {
    id: string
    content: string
    category: string
    hospital_count: number
    study_count: number
    upvotes: number
  }[]
  flagged: {
    id: string
    title: string
    category: string
    confidence_score: number
    status: string
    created_at: string
  }[]
}

const CAT_LABELS: Record<string, string> = {
  airway_management: 'Airway Management',
  cardiac: 'Cardiac',
  obstetric: 'Obstetric',
  pediatric: 'Pediatric',
  pain_management: 'Pain Management',
  emergency: 'Emergency',
  general: 'General',
}

function TrendsPage() {
  const { data } = useQuery<TrendData>({
    queryKey: ['trends'],
    queryFn: () => fetch('/api/trends').then((r) => r.json()),
    refetchInterval: 60_000,
  })

  const maxCount = Math.max(...(data?.by_category ?? []).map((c) => c.count), 1)

  return (
    <PageShell
      title="Research Trends"
      subtitle="Identify gaps, track adoption, and discover research opportunities"
    >
      <div className="p-8 space-y-8">
        {/* Category adoption */}
        <div
          className="rounded-xl p-6"
          style={{ background: '#111827', border: '1px solid #1e2d4a' }}
        >
          <h2 className="text-sm font-semibold text-slate-300 mb-1">
            Category Adoption
          </h2>
          <p className="text-xs text-slate-600 mb-5">
            Protocol count, avg confidence, and total upvotes by specialty
          </p>
          <div className="space-y-3">
            {(data?.by_category ?? []).map((cat) => (
              <div key={cat.category} className="grid grid-cols-12 gap-3 items-center">
                <span className="col-span-3 text-xs text-slate-400 truncate">
                  {CAT_LABELS[cat.category] ?? cat.category}
                </span>
                <div className="col-span-6 h-2 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(cat.count / maxCount) * 100}%`,
                      background:
                        cat.avg_confidence > 0.7
                          ? '#0d9488'
                          : cat.avg_confidence > 0.4
                            ? '#d97706'
                            : '#dc2626',
                    }}
                  />
                </div>
                <span className="col-span-1 text-xs text-slate-500 text-right">
                  {cat.count}
                </span>
                <span className="col-span-2 text-xs text-slate-600 text-right">
                  ↑ {cat.total_upvotes ?? 0}
                </span>
              </div>
            ))}
            {!data && (
              <p className="text-xs text-slate-600">Loading…</p>
            )}
          </div>
        </div>

        {/* Research gaps */}
        <div
          className="rounded-xl p-6"
          style={{ background: '#111827', border: '1px solid #1e2d4a' }}
        >
          <h2 className="text-sm font-semibold text-slate-300 mb-1">
            Research Opportunities
          </h2>
          <p className="text-xs text-slate-600 mb-5">
            Tricks used across multiple hospitals with zero supporting studies —
            prime candidates for formal research
          </p>

          {(data?.research_gaps?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">
              No multi-site unverified tricks yet
            </p>
          ) : (
            <div className="space-y-3">
              {(data?.research_gaps ?? []).map((gap, i) => (
                <div
                  key={gap.id}
                  className="flex items-start gap-4 p-4 rounded-xl"
                  style={{ border: '1px solid #1e2d4a' }}
                >
                  <span className="text-2xl font-bold text-teal-600/40 w-8 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 leading-snug">
                      {gap.content}
                    </p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-xs text-teal-400 font-medium">
                        {gap.hospital_count} hospitals
                      </span>
                      <span className="text-xs text-slate-600">0 studies</span>
                      <span className="text-xs text-slate-500">
                        ↑ {gap.upvotes} upvotes
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: '#1e2d4a', color: '#94a3b8' }}
                      >
                        {CAT_LABELS[gap.category] ?? gap.category}
                      </span>
                    </div>
                  </div>
                  <div
                    className="text-xs px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap"
                    style={{ background: '#0d9488/20', color: '#2dd4bf', border: '1px solid #0d948840' }}
                  >
                    Start Research
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Flagged needs review */}
        <div
          className="rounded-xl p-6"
          style={{ background: '#111827', border: '1px solid #1e2d4a' }}
        >
          <h2 className="text-sm font-semibold text-slate-300 mb-1">
            Peer Review Queue
          </h2>
          <p className="text-xs text-slate-600 mb-5">
            Guidelines auto-flagged for expert review
          </p>

          {(data?.flagged?.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">
              No guidelines need review
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#1e2d4a' }}>
              {(data?.flagged ?? []).map((g) => (
                <Link
                  key={g.id}
                  to="/guidelines/$id"
                  params={{ id: g.id }}
                  className="flex items-center gap-4 py-3 hover:bg-white/5 px-2 rounded-lg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{g.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {CAT_LABELS[g.category] ?? g.category}
                    </p>
                  </div>
                  <ConfidenceBadge score={g.confidence_score} compact />
                  <span
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={
                      g.status === 'flagged'
                        ? { background: '#dc262620', color: '#f87171' }
                        : { background: '#d9780620', color: '#fbbf24' }
                    }
                  >
                    {g.status === 'flagged' ? 'Flagged' : 'Needs Review'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
