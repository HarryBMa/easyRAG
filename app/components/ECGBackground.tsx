import { useEffect, useRef } from 'react'

interface Props {
  avgConfidence?: number  // 0–1
  flaggedCount?: number   // integer count
}

/**
 * Computes the ECG waveform value at time t.
 *
 * Heart rate and amplitude respond to the knowledge base health:
 *   - high confidence → slow, tall, clean QRS
 *   - low confidence  → faster, shorter, jittery rhythm
 *   - flagged > 0     → artifact noise proportional to count
 */
function ecgValue(t: number, confidence: number, flagged: number): number {
  if (t < 0) return 0

  // Beats per minute: higher when confidence is low or many protocols are flagged
  const bpm = 60 + (1 - confidence) * 22 + Math.min(flagged, 6) * 2.5
  const period = 60 / Math.max(bpm, 40)

  // Subtle rhythm irregularity for low-confidence state (like sinus arrhythmia)
  const jitter = (1 - confidence) * 0.11 * Math.sin(t * 0.97 + 1.3)
  const raw = ((t + jitter) % period + period) % period
  const phase = raw / period

  // Peak amplitude scales with confidence
  const amp = 0.28 + confidence * 0.72

  let y = 0

  if (phase < 0.06) {
    // P wave — small positive pre-atrial deflection
    y = Math.sin((phase / 0.06) * Math.PI) * 0.14 * amp
  } else if (phase < 0.15) {
    // PR isoelectric line
    y = 0
  } else if (phase < 0.166) {
    // Q — initial negative deflection
    y = -Math.sin(((phase - 0.15) / 0.016) * Math.PI) * 0.09 * amp
  } else if (phase < 0.186) {
    // R — the primary spike
    y = Math.sin(((phase - 0.166) / 0.02) * Math.PI) * amp
  } else if (phase < 0.202) {
    // S — secondary negative deflection
    y = -Math.sin(((phase - 0.186) / 0.016) * Math.PI) * 0.13 * amp
  } else if (phase < 0.30) {
    // ST segment
    y = 0
  } else if (phase < 0.48) {
    // T wave — broader positive dome
    y = Math.sin(((phase - 0.30) / 0.18) * Math.PI) * 0.19 * amp
  } else {
    // Isoelectric baseline
    y = 0
  }

  // Artifact noise proportional to flagged count — high-frequency interference
  if (flagged > 0) {
    const noiseAmp = Math.min(flagged, 8) * 0.011
    y += noiseAmp * (
      Math.sin(t * 43.7 + 2.1) * 0.6 +
      Math.sin(t * 71.3 + 0.8) * 0.4 +
      Math.sin(t * 127.1 + 1.5) * 0.2
    )
  }

  return y
}

export function ECGBackground({ avgConfidence, flaggedCount = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Use a ref for props so the RAF loop always reads the latest values
  // without needing to restart the loop on every data update
  const propsRef = useRef({ avgConfidence, flaggedCount })
  propsRef.current = { avgConfidence, flaggedCount }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startTime = performance.now()
    let raf = 0

    // DPI-aware resize — keeps the canvas sharp on retina displays
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      if (W === 0 || H === 0) return
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      const { avgConfidence: conf, flaggedCount: flags } = propsRef.current
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight

      if (W === 0 || H === 0) {
        if (!prefersReduced) raf = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, W, H)

      const hasData = conf != null
      const midY = H * 0.52         // slightly below center — feels grounded
      const scrollSpeed = 90        // pixels per second — casual monitor speed
      const amplitude = H * 0.38   // peak-to-trough span

      if (!hasData) {
        // Flatline with dashes — "no signal" state
        ctx.setLineDash([3, 10])
        ctx.strokeStyle = 'rgba(0,212,255,0.055)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, midY)
        ctx.lineTo(W, midY)
        ctx.stroke()
        ctx.setLineDash([])
        if (!prefersReduced) raf = requestAnimationFrame(draw)
        return
      }

      const t = (performance.now() - startTime) / 1000

      // ── Main ECG trace ────────────────────────────────────────────────────
      ctx.beginPath()
      ctx.lineWidth = 1
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = 'rgba(0,212,255,0.10)'

      for (let x = 0; x <= W; x++) {
        const xTime = t - (W - x) / scrollSpeed
        const y = midY - ecgValue(xTime, conf, flags) * amplitude
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()

      // ── Glow layer — brighter on the newest 30% of trace ─────────────────
      const glowStart = W * 0.68
      ctx.beginPath()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = 'rgba(0,212,255,0.045)'

      for (let x = glowStart; x <= W; x++) {
        const xTime = t - (W - x) / scrollSpeed
        const y = midY - ecgValue(xTime, conf, flags) * amplitude
        x === glowStart ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()

      // ── Trailing-edge fade — old trace fades into the past ────────────────
      // Uses destination-out to make the leftmost 28% of the canvas transparent,
      // revealing the page background through it naturally.
      ctx.globalCompositeOperation = 'destination-out'
      const fadeGrad = ctx.createLinearGradient(0, 0, W * 0.28, 0)
      fadeGrad.addColorStop(0, 'rgba(0,0,0,1)')
      fadeGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = fadeGrad
      ctx.fillRect(0, 0, W * 0.28, H)
      ctx.globalCompositeOperation = 'source-over'

      if (!prefersReduced) raf = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
      aria-hidden="true"
    />
  )
}
