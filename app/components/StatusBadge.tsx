const CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  active:       { label: 'Active',        bg: '#0d948820', color: '#2dd4bf' },
  needs_review: { label: 'Needs Review',  bg: '#d9780620', color: '#fbbf24' },
  flagged:      { label: 'Flagged',       bg: '#dc262620', color: '#f87171' },
  processing:   { label: 'Processing…',   bg: '#0284c720', color: '#38bdf8' },
  error:        { label: 'Error',         bg: '#dc262620', color: '#f87171' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status] ?? { label: status, bg: '#ffffff10', color: '#94a3b8' }
  return (
    <span
      className="inline-block text-[10px] font-medium px-2 py-0.5 rounded mt-1"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}
