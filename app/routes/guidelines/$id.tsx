import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ConfidenceBadge } from '../../components/ConfidenceBadge'
import { StatusBadge } from '../../components/StatusBadge'
import { PageShell } from '../__root'

export const Route = createFileRoute('/guidelines/$id')({
  component: GuidelineDetailPage,
})

interface Source {
  pubmed_id: string
  title: string
  authors: string
  journal: string
  year: number
  url: string
  relevance_score: number
}

interface GuidelineDetail {
  id: string
  title: string
  hospital: string
  category: string
  status: string
  confidence_score: number
  source_quality: number
  upvotes: number
  downvotes: number
  pubmed_count: number
  created_at: string
  structured_json: {
    drugs: { name: string; dose: string; route: string; timing?: string }[]
    steps: string[]
    indications: string[]
    contraindications: string[]
    notes: string[]
    flag_reasons?: string[]
  }
  sources: Source[]
}

function GuidelineDetailPage() {
  const { id } = Route.useParams()
  const { data: g, isLoading } = useQuery<GuidelineDetail>({
    queryKey: ['guideline', id],
    queryFn: () => fetch(`/api/guidelines/${id}`).then((r) => r.json()),
  })

  if (isLoading) {
    return (
      <PageShell title="Loading…">
        <div className="p-8 text-slate-500">Fetching guideline…</div>
      </PageShell>
    )
  }

  if (!g || (g as unknown as { error: string }).error) {
    return (
      <PageShell title="Not Found">
        <div className="p-8">
          <p className="text-slate-400">Guideline not found.</p>
          <Link to="/guidelines" className="text-sky-400 text-sm mt-2 inline-block">
            ← Back to guidelines
          </Link>
        </div>
      </PageShell>
    )
  }

  const s = g.structured_json

  return (
    <PageShell
      title={g.title}
      subtitle={g.hospital ? `${g.hospital} · ${g.category}` : g.category}
      action={
        <div className="flex items-center gap-3">
          <ConfidenceBadge score={g.confidence_score} />
          <StatusBadge status={g.status} />
        </div>
      }
    >
      <div className="p-8 grid grid-cols-3 gap-6">
        {/* Main content */}
        <div className="col-span-2 space-y-6">
          {/* Flag reasons */}
          {s?.flag_reasons && s.flag_reasons.length > 0 && (
            <div
              className="rounded-xl p-4"
              style={{ background: '#1a1222', border: '1px solid #3b2a1e' }}
            >
              <p className="text-xs font-semibold text-amber-400 mb-2">
                ⚠️ Auto-detected Issues
              </p>
              <ul className="space-y-1">
                {s.flag_reasons.map((r, i) => (
                  <li key={i} className="text-xs text-amber-200/70">
                    • {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drugs table */}
          {s?.drugs?.length > 0 && (
            <Section title="Drug Regimen">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b" style={{ borderColor: '#1e2d4a' }}>
                    <th className="pb-2 font-medium">Drug</th>
                    <th className="pb-2 font-medium">Dose</th>
                    <th className="pb-2 font-medium">Route</th>
                    <th className="pb-2 font-medium">Timing</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: '#1e2d4a' }}>
                  {s.drugs.map((d, i) => (
                    <tr key={i}>
                      <td className="py-2 font-medium text-sky-300">{d.name}</td>
                      <td className="py-2 text-slate-300">{d.dose}</td>
                      <td className="py-2 text-slate-400">{d.route}</td>
                      <td className="py-2 text-slate-500">{d.timing ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Steps */}
          {s?.steps?.length > 0 && (
            <Section title="Protocol Steps">
              <ol className="space-y-2">
                {s.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                      style={{ background: '#0284c7', color: '#fff' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <div className="grid grid-cols-2 gap-4">
            {s?.indications?.length > 0 && (
              <Section title="Indications">
                <ul className="space-y-1">
                  {s.indications.map((item, i) => (
                    <li key={i} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-teal-500">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {s?.contraindications?.length > 0 && (
              <Section title="Contraindications">
                <ul className="space-y-1">
                  {s.contraindications.map((item, i) => (
                    <li key={i} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-red-500">✗</span> {item}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          {s?.notes?.length > 0 && (
            <Section title="Notes">
              <ul className="space-y-1">
                {s.notes.map((note, i) => (
                  <li key={i} className="text-sm text-slate-400 flex gap-2">
                    <span>•</span> {note}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Sidebar: meta + sources */}
        <div className="space-y-5">
          <Section title="Stats">
            <div className="space-y-2">
              <Meta label="Confidence" value={`${(g.confidence_score * 100).toFixed(0)}%`} />
              <Meta label="Source quality" value={`${(g.source_quality * 100).toFixed(0)}%`} />
              <Meta label="PubMed matches" value={String(g.pubmed_count)} />
              <Meta label="Upvotes" value={`↑ ${g.upvotes}  ↓ ${g.downvotes}`} />
            </div>
          </Section>

          {g.sources.length > 0 && (
            <Section title={`PubMed Sources (${g.sources.length})`}>
              <div className="space-y-3">
                {g.sources.map((src) => (
                  <a
                    key={src.pubmed_id}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-white/5 rounded-lg p-2 transition-colors"
                  >
                    <p className="text-xs text-sky-400 leading-snug font-medium">
                      {src.title}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {src.journal} · {src.year}
                    </p>
                  </a>
                ))}
              </div>
            </Section>
          )}

          <Link
            to="/guidelines"
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors block"
          >
            ← Back to guidelines
          </Link>
        </div>
      </div>
    </PageShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#111827', border: '1px solid #1e2d4a' }}
    >
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  )
}
