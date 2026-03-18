'use client'

import { useRef, useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function QueryPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const submit = async () => {
    const question = input.trim()
    if (!question || streaming) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${err.error}` },
        ])
        return
      }

      // Stream the response using the AI SDK data stream format
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let answer = ''

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse AI SDK data stream format (lines prefixed with "0:")
        for (const line of chunk.split('\n')) {
          if (line.startsWith('0:')) {
            try {
              const text = JSON.parse(line.slice(2))
              answer += text
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: answer }
                return next
              })
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Request failed. Try again.' },
        ])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-400 font-medium">Ask anything about your documents</p>
            <p className="text-gray-600 text-sm mt-1">
              Upload documents first, then ask questions
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                }`}
            >
              {msg.content || (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
            placeholder="Ask a question about your documents…"
            disabled={streaming}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
              text-sm text-gray-100 placeholder-gray-600 outline-none
              focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
          {streaming ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="bg-red-600 hover:bg-red-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white
                rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Ask
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
