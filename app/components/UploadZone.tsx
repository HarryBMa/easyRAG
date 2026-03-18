'use client'

import { useRef, useState } from 'react'

interface Props {
  onUploadComplete: () => void
}

export function UploadZone({ onUploadComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }
      onUploadComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    for (const file of files) upload(file)
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        Upload Documents
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
          ${dragging ? 'border-indigo-400 bg-indigo-950/30' : 'border-gray-700 hover:border-gray-500'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.docx,.md"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <p className="text-sm text-indigo-400">Uploading…</p>
        ) : (
          <>
            <p className="text-2xl mb-1">📄</p>
            <p className="text-sm text-gray-400">
              Drop files or click to upload
            </p>
            <p className="text-xs text-gray-600 mt-1">PDF, TXT, DOCX, MD</p>
          </>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2 font-mono">{error}</p>
      )}
    </div>
  )
}
