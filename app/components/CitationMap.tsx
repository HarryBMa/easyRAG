/**
 * CitationMap — force-directed citation/knowledge graph.
 *
 * Inspired by Connected Papers, LitMaps, and Research Rabbit.
 * Renders a guideline's source papers as an interactive node graph
 * with citation relationships from Semantic Scholar.
 *
 * No external graph library required — runs a spring physics simulation
 * directly via requestAnimationFrame + SVG.
 *
 * Usage:
 *   <CitationMap guidelineId="abc123" />
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CitationGraph, GraphNode, GraphEdge } from '../../lib/citationGraph'

// ── Visual config ────────────────────────────────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  guideline: '#6366f1', // indigo — the central guideline
  review: '#8b5cf6',   // purple — systematic reviews / Cochrane
  paper: '#3b82f6',    // blue   — individual articles
  trick: '#f59e0b',    // amber  — crowd-sourced tips
}

const EDGE_COLOR: Record<string, string> = {
  supports: '#10b981',    // green
  contradicts: '#ef4444', // red
  cites: '#374151',       // dark gray
  cited_by: '#374151',
  related: '#7c3aed',
}

function nodeRadius(node: GraphNode): number {
  if (node.type === 'guideline') return 24
  if (node.type === 'review') return 16
  const scaled = 7 + Math.sqrt(Math.max(0, node.citation_count)) * 0.45
  return Math.min(scaled, 18)
}

// ── Force simulation ─────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number; vx: number; vy: number }

function simulate(
  positions: Map<string, Vec2>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  alpha: number,
) {
  const cx = width / 2
  const cy = height / 2

  // Repulsion between all pairs
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const pi = positions.get(nodes[i].id)
      const pj = positions.get(nodes[j].id)
      if (!pi || !pj) continue
      const dx = pj.x - pi.x
      const dy = pj.y - pi.y
      const d2 = dx * dx + dy * dy || 1
      const d = Math.sqrt(d2)
      const repulse = (3200 / d2) * alpha
      const nx = dx / d
      const ny = dy / d
      pi.vx -= nx * repulse
      pi.vy -= ny * repulse
      pj.vx += nx * repulse
      pj.vy += ny * repulse
    }
  }

  // Spring attraction along edges
  for (const edge of edges) {
    const ps = positions.get(edge.source)
    const pt = positions.get(edge.target)
    if (!ps || !pt) continue
    const dx = pt.x - ps.x
    const dy = pt.y - ps.y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const restLen = 130
    const spring = ((d - restLen) / d) * 0.07 * alpha * edge.weight
    ps.vx += dx * spring
    ps.vy += dy * spring
    pt.vx -= dx * spring
    pt.vy -= dy * spring
  }

  // Centre gravity + integrate
  for (const node of nodes) {
    const p = positions.get(node.id)
    if (!p) continue
    if (node.type === 'guideline') {
      p.x = cx; p.y = cy; p.vx = 0; p.vy = 0
      continue
    }
    p.vx += (cx - p.x) * 0.006 * alpha
    p.vy += (cy - p.y) * 0.006 * alpha
    p.vx *= 0.86
    p.vy *= 0.86
    p.x = Math.max(28, Math.min(width - 28, p.x + p.vx))
    p.y = Math.max(28, Math.min(height - 28, p.y + p.vy))
  }
}

// ── Component ────────────────────────────────────────────────────────────────

interface CitationMapProps {
  guidelineId: string
  width?: number
  height?: number
}

export function CitationMap({ guidelineId, width = 820, height = 580 }: CitationMapProps) {
  const [graph, setGraph] = useState<CitationGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ node: GraphNode; sx: number; sy: number } | null>(null)
  const [, tick] = useState(0)

  const svgRef = useRef<SVGSVGElement>(null)
  const posRef = useRef(new Map<string, Vec2>())
  const animRef = useRef<number>(0)
  const alphaRef = useRef(1)

  // Fetch graph data
  useEffect(() => {
    setLoading(true)
    fetch(`/api/citation-graph?guideline_id=${guidelineId}`)
      .then((r) => r.json())
      .then((data) => {
        setGraph(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(String(e))
        setLoading(false)
      })
  }, [guidelineId])

  // Initialise node positions
  useEffect(() => {
    if (!graph) return
    const cx = width / 2
    const cy = height / 2
    posRef.current = new Map()
    graph.nodes.forEach((node, i) => {
      if (node.type === 'guideline') {
        posRef.current.set(node.id, { x: cx, y: cy, vx: 0, vy: 0 })
      } else {
        const angle = (i / graph.nodes.length) * 2 * Math.PI
        const r = 160 + Math.random() * 80
        posRef.current.set(node.id, {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
        })
      }
    })
    alphaRef.current = 1
  }, [graph, width, height])

  // Run simulation
  useEffect(() => {
    if (!graph) return
    const loop = () => {
      if (alphaRef.current < 0.008) return
      alphaRef.current *= 0.96
      simulate(posRef.current, graph.nodes, graph.edges, width, height, alphaRef.current)
      tick((n) => n + 1)
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [graph, width, height])

  const handleNodeEnter = useCallback(
    (node: GraphNode) => {
      const p = posRef.current.get(node.id)
      if (p) setTooltip({ node, sx: p.x, sy: p.y })
    },
    [],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-gray-950 border border-gray-800 text-gray-400 text-sm" style={{ width, height }}>
        <span className="animate-pulse">Building citation graph…</span>
      </div>
    )
  }

  if (error || !graph) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-gray-950 border border-red-900 text-red-400 text-sm" style={{ width, height }}>
        Could not load citation graph
      </div>
    )
  }

  const pos = posRef.current

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-950 border border-gray-800 select-none">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="w-full h-full"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Arrow markers */}
        <defs>
          <marker id="arrow-cites" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={EDGE_COLOR.cites} opacity={0.5} />
          </marker>
          <marker id="arrow-supports" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={EDGE_COLOR.supports} />
          </marker>
          <marker id="arrow-contradicts" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={EDGE_COLOR.contradicts} />
          </marker>
        </defs>

        {/* Edges */}
        {graph.edges.map((edge, i) => {
          const ps = pos.get(edge.source)
          const pt = pos.get(edge.target)
          if (!ps || !pt) return null
          const color = EDGE_COLOR[edge.type] ?? EDGE_COLOR.cites
          const isHighlight = edge.type === 'supports' || edge.type === 'contradicts'
          return (
            <line
              key={i}
              x1={ps.x} y1={ps.y}
              x2={pt.x} y2={pt.y}
              stroke={color}
              strokeWidth={isHighlight ? 2 : 1}
              strokeOpacity={isHighlight ? 0.8 : 0.35}
              strokeDasharray={edge.type === 'cites' ? '4,3' : undefined}
              markerEnd={isHighlight ? `url(#arrow-${edge.type})` : undefined}
            />
          )
        })}

        {/* Nodes */}
        {graph.nodes.map((node) => {
          const p = pos.get(node.id)
          if (!p) return null
          const r = nodeRadius(node)
          const color = NODE_COLOR[node.type] ?? NODE_COLOR.paper
          const validated = node.validation_type === 'validated'
          const contradicted = node.validation_type === 'contradicted'

          return (
            <g
              key={node.id}
              transform={`translate(${Math.round(p.x)},${Math.round(p.y)})`}
              className="cursor-pointer"
              onMouseEnter={() => handleNodeEnter(node)}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => {
                if (node.type !== 'guideline') window.open(node.url, '_blank')
              }}
            >
              {/* Validation ring */}
              {(validated || contradicted) && (
                <circle
                  r={r + 4}
                  fill="none"
                  stroke={validated ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  opacity={0.6}
                />
              )}
              {/* Main circle */}
              <circle
                r={r}
                fill={color}
                opacity={node.type === 'guideline' ? 1 : 0.85}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
              {/* Guideline star */}
              {node.type === 'guideline' && (
                <text textAnchor="middle" dy="5" fontSize="13" fill="white">★</text>
              )}
              {/* Review label */}
              {node.type === 'review' && (
                <text textAnchor="middle" dy="4" fontSize="8" fill="white" opacity={0.9}>SR</text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-gray-900/80 backdrop-blur-sm rounded-lg p-2.5 text-xs text-gray-300 space-y-1.5 border border-gray-700/50">
        {[
          { color: NODE_COLOR.guideline, label: 'This guideline' },
          { color: NODE_COLOR.review, label: 'Systematic review / Cochrane' },
          { color: NODE_COLOR.paper, label: 'Article (size = citations)' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
            {label}
          </div>
        ))}
        <div className="border-t border-gray-700 pt-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-green-500 shrink-0" />
            validates
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 border-t-2 border-red-500 shrink-0" />
            contradicts
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 border-t border-gray-600 border-dashed shrink-0" />
            cites
          </div>
        </div>
      </div>

      {/* Node count badge */}
      <div className="absolute top-3 right-3 bg-gray-900/80 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-gray-400 border border-gray-700/50">
        {graph.nodes.length} nodes · {graph.edges.length} edges
      </div>

      {/* Tooltip */}
      {tooltip && (() => {
        const svgW = svgRef.current?.clientWidth ?? width
        const tooltipX = Math.min(tooltip.sx + 16, svgW - 260)
        const tooltipY = Math.max(tooltip.sy - 50, 8)
        return (
          <div
            className="absolute pointer-events-none z-20 bg-gray-900 border border-gray-700 rounded-xl p-3.5 shadow-2xl max-w-[240px]"
            style={{ left: tooltipX, top: tooltipY }}
          >
            <p className="font-semibold text-white text-xs leading-snug mb-1.5">
              {tooltip.node.title}
            </p>
            {tooltip.node.authors && (
              <p className="text-gray-400 text-xs truncate">{tooltip.node.authors}</p>
            )}
            <div className="flex gap-3 mt-1 text-xs text-gray-500">
              {tooltip.node.year && <span>{tooltip.node.year}</span>}
              {tooltip.node.citation_count > 0 && (
                <span>{tooltip.node.citation_count.toLocaleString()} citations</span>
              )}
            </div>
            {tooltip.node.tldr && (
              <p className="mt-2 text-xs text-indigo-300 italic leading-snug">
                "{tooltip.node.tldr}"
              </p>
            )}
            {tooltip.node.validation_type && tooltip.node.validation_type !== 'unvalidated' && (
              <span
                className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                  tooltip.node.validation_type === 'validated'
                    ? 'bg-green-900/60 text-green-300'
                    : 'bg-red-900/60 text-red-300'
                }`}
              >
                {tooltip.node.validation_type}
              </span>
            )}
            {tooltip.node.type !== 'guideline' && (
              <p className="mt-1.5 text-xs text-indigo-400">↗ click to open</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
