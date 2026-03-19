// Aligned with design tokens from .impeccable.md
const CONFIG: Record<string, { label: string; bg: string; border: string; color: string }> = {
  active:       { label: 'ACTIVE',   bg: 'rgba(0,255,136,0.08)',  border: 'rgba(0,255,136,0.18)',  color: '#00ff88' },
  needs_review: { label: 'REVIEW',   bg: 'rgba(255,170,0,0.08)',  border: 'rgba(255,170,0,0.18)',  color: '#ffaa00' },
  flagged:      { label: 'FLAGGED',  bg: 'rgba(255,51,85,0.08)',  border: 'rgba(255,51,85,0.18)',  color: '#ff3355' },
  processing:   { label: 'PROC…',    bg: 'rgba(0,212,255,0.08)',  border: 'rgba(0,212,255,0.18)',  color: '#00d4ff' },
  error:        { label: 'ERROR',    bg: 'rgba(255,51,85,0.08)',  border: 'rgba(255,51,85,0.18)',  color: '#ff3355' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status] ?? {
    label: status.toUpperCase().replace('_', ' '),
    bg: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    color: '#4a6585',
  }
  return (
    <span
      className="inline-block font-semibold px-2 py-0.5 rounded"
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 'var(--text-label)',
        letterSpacing: '0.08em',
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  )
}
