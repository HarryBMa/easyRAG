interface Props {
  score: number
  compact?: boolean
}

export function ConfidenceBadge({ score, compact = false }: Props) {
  const pct = Math.round(score * 100)

  const { bg, text, label } =
    score >= 0.7
      ? { bg: '#0d948820', text: '#2dd4bf', label: 'High' }
      : score >= 0.4
        ? { bg: '#d9780620', text: '#fbbf24', label: 'Medium' }
        : { bg: '#dc262620', text: '#f87171', label: 'Low' }

  if (compact) {
    return (
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
        style={{ background: bg, color: text }}
      >
        {pct}%
      </span>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
      style={{ background: bg, border: `1px solid ${text}40` }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: text }} />
      <span className="text-xs font-medium" style={{ color: text }}>
        {label} Confidence · {pct}%
      </span>
    </div>
  )
}
