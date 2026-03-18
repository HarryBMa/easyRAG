'use client'

import { useRef, useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

type Stage = 'idle' | 'ocr' | 'structuring' | 'indexing' | 'done' | 'error'

const STAGE_LABELS: Record<Stage, string> = {
  idle:       'Ready to upload',
  ocr:        'OCR extraction in progress…',
  structuring:'MedGemma structuring guideline…',
  indexing:   'Indexing in pgvector…',
  done:       'Done! Guideline added.',
  error:      'Upload failed',
}

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

      // Simulate processing stages while polling
      setStage('structuring')
      await sleep(1500)
      setStage('indexing')
      await sleep(1000)
      setStage('done')

      setTimeout(onSuccess, 800)
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: '#111827', border: '1px solid #1e2d4a' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Upload Guideline</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Upload a scanned PDF, image, DOCX, or plain text protocol. DeepSeek OCR
          + MedGemma will extract, structure, and score it automatically.
        </p>

        <input
          value={hospital}
          onChange={(e) => setHospital(e.target.value)}
          placeholder="Hospital / institution (optional)"
          disabled={isProcessing}
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5
            text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-sky-500
            disabled:opacity-50 transition-colors"
        />

        {/* Drop zone */}
        {stage === 'idle' && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${dragging ? 'border-sky-400 bg-sky-950/20' : 'border-slate-700 hover:border-slate-500'}`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt,.docx,.md,.png,.jpg,.jpeg,.tiff"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm text-slate-400 font-medium">Drop a file or click to browse</p>
            <p className="text-xs text-slate-600 mt-1">
              PDF · DOCX · TXT · MD · PNG · JPG · TIFF
            </p>
          </div>
        )}

        {/* Processing stages */}
        {stage !== 'idle' && (
          <div className="space-y-4">
            {file && (
              <p className="text-xs text-slate-500 truncate">
                📄 {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}

            <PipelineStages current={stage} />

            <p
              className={`text-sm font-medium ${
                stage === 'done'
                  ? 'text-teal-400'
                  : stage === 'error'
                    ? 'text-red-400'
                    : 'text-sky-400'
              }`}
            >
              {STAGE_LABELS[stage]}
            </p>

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            {stage === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PIPELINE: { stage: Stage; label: string }[] = [
  { stage: 'ocr',        label: 'OCR Extraction' },
  { stage: 'structuring', label: 'LLM Structuring' },
  { stage: 'indexing',   label: 'Vector Indexing' },
  { stage: 'done',       label: 'Synced' },
]

const ORDER: Stage[] = ['ocr', 'structuring', 'indexing', 'done']

function PipelineStages({ current }: { current: Stage }) {
  const currentIdx = ORDER.indexOf(current)

  return (
    <div className="flex items-center gap-0">
      {PIPELINE.map(({ stage, label }, i) => {
        const idx = ORDER.indexOf(stage)
        const done = idx < currentIdx || current === 'done'
        const active = stage === current

        return (
          <div key={stage} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  transition-all ${
                    done
                      ? 'bg-teal-500 text-white'
                      : active
                        ? 'bg-sky-500 text-white animate-pulse'
                        : 'bg-slate-800 text-slate-600 border border-slate-700'
                  }`}
              >
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] mt-1 ${active ? 'text-sky-400' : done ? 'text-teal-400' : 'text-slate-700'}`}>
                {label}
              </span>
            </div>
            {i < PIPELINE.length - 1 && (
              <div
                className="h-px flex-1 mb-4 transition-all"
                style={{ background: done ? '#0d9488' : '#1e2d4a' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
