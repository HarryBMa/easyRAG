const BADGE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  community_approved: { icon: '⭐', label: 'Community Approved', color: '#fbbf24' },
  multi_site:         { icon: '🏥', label: 'Multi-site',         color: '#38bdf8' },
  evidence_backed:    { icon: '📄', label: 'Evidence Backed',    color: '#2dd4bf' },
  research_opportunity: { icon: '🔬', label: 'Research Opportunity', color: '#a78bfa' },
}

interface Trick {
  id: string
  content: string
  author?: string
  hospital?: string
  category: string
  upvotes: number
  downvotes: number
  hospital_count: number
  study_count: number
  badges: string[]
  created_at: string
}

interface Props {
  trick: Trick
  onVote?: () => void
}

// Stable anonymous user ID for demo (in production this would be auth-derived)
const USER_ID =
  typeof window !== 'undefined'
    ? (() => {
        let id = localStorage.getItem('ps_uid')
        if (!id) {
          id = Math.random().toString(36).slice(2)
          localStorage.setItem('ps_uid', id)
        }
        return id
      })()
    : 'anon'

export function TrickCard({ trick: t, onVote }: Props) {
  const vote = async (type: 'up' | 'down') => {
    await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: 'trick',
        entity_id: t.id,
        user_id: USER_ID,
        vote_type: type,
      }),
    })
    onVote?.()
  }

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#111827', border: '1px solid #1e2d4a' }}
    >
      <div className="flex gap-4">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={() => vote('up')}
            className="text-slate-600 hover:text-teal-400 transition-colors text-lg leading-none"
          >
            ▲
          </button>
          <span className="text-sm font-bold text-slate-300">
            {t.upvotes - t.downvotes}
          </span>
          <button
            onClick={() => vote('down')}
            className="text-slate-600 hover:text-red-400 transition-colors text-lg leading-none"
          >
            ▼
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-relaxed">{t.content}</p>

          {/* Badges */}
          {t.badges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {t.badges.map((badge) => {
                const cfg = BADGE_CONFIG[badge]
                if (!cfg) return null
                return (
                  <span
                    key={badge}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}
                  >
                    {cfg.icon} {cfg.label}
                  </span>
                )
              })}
            </div>
          )}

          {/* Footer meta */}
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
            {(t.author || t.hospital) && (
              <span>
                {[t.author, t.hospital].filter(Boolean).join(' · ')}
              </span>
            )}
            <span>
              {t.hospital_count > 1
                ? `Used at ${t.hospital_count} hospitals`
                : 'Submitted'}
            </span>
            {t.study_count === 0 ? (
              <span className="text-purple-500/70">Unverified (0 studies)</span>
            ) : (
              <span className="text-teal-600">{t.study_count} study/studies</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
