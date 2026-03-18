'use client'

import { useEffect, useState } from 'react'

interface Doc {
  id: string
  name: string
  category: string
  status: 'processing' | 'ready' | 'error'
  chunk_count: number
  file_size: number
  created_at: string
}

const STATUS_COLOR = {
  processing: 'text-yellow-400',
  ready: 'text-green-400',
  error: 'text-red-400',
}

const STATUS_LABEL = {
  processing: '⏳',
  ready: '✓',
  error: '✗',
}

export function DocumentList() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocs = async () => {
    try {
      const res = await fetch('/api/documents')
      if (res.ok) setDocs(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocs()
    // Poll for processing status updates
    const interval = setInterval(fetchDocs, 3000)
    return () => clearInterval(interval)
  }, [])

  const deleteDoc = async (id: string) => {
    await fetch('/api/documents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setDocs((prev) => prev.filter((d) => d.id !== id))
  }

  if (loading) {
    return (
      <div className="p-4 text-xs text-gray-600">Loading documents…</div>
    )
  }

  if (!docs.length) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-gray-600">No documents yet</p>
        <p className="text-xs text-gray-700 mt-1">Upload a file to get started</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-800/50">
      {docs.map((doc) => (
        <li key={doc.id} className="px-4 py-3 group flex items-start gap-3">
          <span
            className={`mt-0.5 text-xs font-mono w-4 shrink-0 ${STATUS_COLOR[doc.status]}`}
          >
            {STATUS_LABEL[doc.status]}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate font-medium">
              {doc.name}
            </p>
            <div className="flex gap-2 mt-0.5">
              <span className="text-xs text-indigo-400 bg-indigo-950/50 px-1.5 py-0.5 rounded">
                {doc.category ?? 'uncategorized'}
              </span>
              {doc.chunk_count > 0 && (
                <span className="text-xs text-gray-600">
                  {doc.chunk_count} chunks
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => deleteDoc(doc.id)}
            className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
