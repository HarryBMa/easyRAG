interface Props {
  score: number
  compact?: boolean
}

// Aligned with design tokens: #00ff88 green / #ffaa00 amber / #ff3355 red
const TIER = (score: number) =>
  score >= 0.7
    ? { bg: 'rgba(0,255,136,0.1)',  border: 'rgba(0,255,136,0.22)',  text: '#00ff88', label: 'High' }
    : score >= 0.4
      ? { bg: 'rgba(255,170,0,0.1)', border: 'rgba(255,170,0,0.22)',  text: '#ffaa00', label: 'Med' }
      : { bg: 'rgba(255,51,85,0.1)', border: 'rgba(255,51,85,0.22)',  text: '#ff3355', label: 'Low' }

export function ConfidenceBadge({ score, compact = false }: Props) {
  const pct = Math.round(score * 100)
  const tier = TIER(score)

  if (compact) {
    return (
      <span
        className="tabular font-bold px-1.5 py-0.5 rounded"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 'var(--text-label)',
          background: tier.bg,
          color: tier.text,
        }}
      >
        {pct}%
      </span>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
      style={{ background: tier.bg, border: `1px solid ${tier.border}` }}
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tier.text }} />
      <span
        className="tabular font-semibold"
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 'var(--text-label)',
          letterSpacing: '0.06em',
          color: tier.text,
        }}
      >
        {tier.label} · {pct}%
      </span>
    </div>
  )
}
