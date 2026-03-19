'use client'

import { useRef, useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Stage = 'idle' | 'ocr' | 'structuring' | 'indexing' | 'done' | 'error'

const PIPELINE: { stage: Stage; label: string; icon: string }[] = [
  { stage: 'ocr',         label: 'OCR',       icon: '01' },
  { stage: 'structuring', label: 'LLM',        icon: '02' },
  { stage: 'indexing',    label: 'INDEX',      icon: '03' },
  { stage: 'done',        label: 'SYNCED',     icon: '04' },
]
const ORDER: Stage[] = ['ocr', 'structuring', 'indexing', 'done']

export function UploadGuideline({ onClose, onSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hospital, setHospital] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const upload = async (f: File) => {
    setFile(f)
    setStage('ocr')
    setError('')

    const form = new FormData()
    form.append('file', f)
    if (hospital) form.append('hospital', hospital)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }
      setStage('structuring')
      await sleep(1500)
      setStage('indexing')
      await sleep(1000)
      setStage('done')
      setTimeout(onSuccess, 900)
    } catch (e) {
      setError((e as Error).message)
      setStage('error')
    }
  }

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (f) upload(f)
  }

  const isProcessing = stage !== 'idle' && stage !== 'done' && stage !== 'error'
  const isDone = stage === 'done'
  const isError = stage === 'error'
  const currentIdx = ORDER.indexOf(stage)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(2,9,18,0.88)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl fade-up"
        style={{
          background: '#040c1a',
          border: '1px solid rgba(0,212,255,0.12)',
          boxShadow: '0 0 60px rgba(0,212,255,0.06)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{
          borderBottom: '1px solid rgba(0,212,255,0.06)',
        }}>
          <div>
            <p className="type-heading font-bold" style={{ fontSize: 'var(--text-heading)', color: '#e2eaf5' }}>
              Upload Protocol
            </p>
            <p className="type-label mt-0.5" style={{ color: '#1e3650', letterSpacing: '0.12em' }}>
              OCR · LLM STRUCTURING · VECTOR INDEXING
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ color: '#2d4a68' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e2eaf5'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#2d4a68'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Hospital input */}
          <input
            value={hospital}
            onChange={e => setHospital(e.target.value)}
            placeholder="Hospital / institution (optional)"
            disabled={isProcessing}
            className="w-full rounded-lg px-3.5 py-2.5 text-xs outline-none transition-colors disabled:opacity-40"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              background: 'rgba(0,212,255,0.03)',
              border: '1px solid rgba(0,212,255,0.09)',
              color: '#6b87a8',
            }}
            onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.22)'}
            onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(0,212,255,0.09)'}
          />

          {/* Drop zone */}
          {stage === 'idle' && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
              className={`rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? 'drop-breathe' : ''}`}
              style={{
                border: `1px dashed ${dragging ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.12)'}`,
                background: dragging ? 'rgba(0,212,255,0.04)' : 'transparent',
                transition: 'border-color 200ms ease, background 200ms ease',
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.txt,.docx,.md,.png,.jpg,.jpeg,.tiff"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="1.2" strokeLinecap="round" className="mx-auto mb-3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
              <p className="type-body mb-1" style={{ fontSize: 'var(--text-secondary)', color: '#3d5a76' }}>
                Drop file or click to browse
              </p>
              <p className="type-label" style={{ color: '#1e3650', letterSpacing: '0.08em' }}>
                PDF · DOCX · TXT · PNG · JPG
              </p>
            </div>
          )}

          {/* Processing state */}
          {stage !== 'idle' && (
            <div className="space-y-4 fade-up">
              {/* File info */}
              {file && (
                <div className="flex items-center gap-2">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(0,212,255,0.3)" strokeWidth="1.2">
                    <rect x="1" y="1" width="8" height="8" rx="1" />
                    <line x1="3" y1="4" x2="7" y2="4" />
                    <line x1="3" y1="6" x2="5.5" y2="6" />
                  </svg>
                  <span className="text-[9px] truncate" style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#2d4a68' }}>
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              )}

              {/* Scan container */}
              {isProcessing && (
                <div className="relative overflow-hidden rounded-lg py-3 px-4" style={{
                  background: 'rgba(0,212,255,0.03)',
                  border: '1px solid rgba(0,212,255,0.08)',
                }}>
                  <div className="scan-line" />
                  <p className="type-label relative z-10" style={{
                    color: '#00d4ff',
                    opacity: 0.7,
                    letterSpacing: '0.1em',
                  }}>
                    {stage === 'ocr' && 'EXTRACTING TEXT…'}
                    {stage === 'structuring' && 'STRUCTURING WITH MEDGEMMA…'}
                    {stage === 'indexing' && 'INDEXING IN PGVECTOR…'}
                  </p>
                </div>
              )}

              {/* Pipeline steps */}
              <div className="flex items-center gap-0">
                {PIPELINE.map(({ stage: s, label }, i) => {
                  const idx = ORDER.indexOf(s)
                  const done = isDone || (idx < currentIdx)
                  const active = s === stage && !isDone

                  return (
                    <div key={s} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1 gap-1.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold transition-all"
                          style={{
                            fontFamily: "'IBM Plex Mono', monospace",
                            background: done
                              ? 'rgba(0,255,136,0.12)'
                              : active
                                ? 'rgba(0,212,255,0.1)'
                                : 'rgba(0,212,255,0.03)',
                            border: done
                              ? '1px solid rgba(0,255,136,0.3)'
                              : active
                                ? '1px solid rgba(0,212,255,0.3)'
                                : '1px solid rgba(0,212,255,0.07)',
                            color: done ? '#00ff88' : active ? '#00d4ff' : '#1e3650',
                            boxShadow: active ? '0 0 10px rgba(0,212,255,0.2)' : 'none',
                          }}
                        >
                          {done ? (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <polyline points="1,4 3,6 7,2" />
                            </svg>
                          ) : (
                            PIPELINE[i].icon
                          )}
                        </div>
                        <span
                          className="type-label"
                          style={{
                            letterSpacing: '0.08em',
                            color: done ? '#00ff8870' : active ? '#00d4ff80' : '#0f2035',
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      {i < PIPELINE.length - 1 && (
                        <div className="h-px flex-1 mb-4 transition-all" style={{
                          background: done ? 'rgba(0,255,136,0.2)' : 'rgba(0,212,255,0.06)',
                          transition: 'background 400ms ease',
                        }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Done / error message */}
              {isDone && (
                <div className="flex items-center gap-2 fade-up" style={{
                  color: '#00ff88',
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <polyline points="1,5 4,8 9,2" />
                  </svg>
                  <span className="type-label" style={{ letterSpacing: '0.1em' }}>
                    PROTOCOL ADDED SUCCESSFULLY
                  </span>
                </div>
              )}

              {isError && (
                <div className="fade-up">
                  <p className="type-label mb-1" style={{ letterSpacing: '0.08em', color: '#ff3355' }}>
                    PIPELINE ERROR
                  </p>
                  {error && (
                    <p className="text-[9px] px-2 py-1.5 rounded" style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      background: 'rgba(255,51,85,0.06)',
                      border: '1px solid rgba(255,51,85,0.15)',
                      color: '#ff335580',
                    }}>
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-1">
            <button
              onClick={onClose}
              className="text-[9px] tracking-[0.08em] transition-colors"
              style={{ fontFamily: "'IBM Plex Mono', monospace", color: '#1e3650' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#3d5a76'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#1e3650'}
            >
              {isDone ? 'CLOSE' : 'CANCEL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
