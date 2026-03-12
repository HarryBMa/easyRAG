import { useEffect, useRef, useState } from 'react';
import { api, type QueryResponse } from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: unknown[];
}

interface ChatInterfaceProps {
  specialistId: string | null;
}

export function ChatInterface({ specialistId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const result = await api.post<QueryResponse>('/api/query', {
        question,
        mode: 'hybrid',
        specialist_role: specialistId,
      });

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const msg = (err as { detail?: string }).detail ?? 'Failed to get a response.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '60vh',
        minHeight: 400,
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: '0.9rem',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💬</div>
              <p>Ask a question about your uploaded medical documents.</p>
              {!specialistId && (
                <p style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
                  Tip: Select a specialist role above for context-aware answers.
                </p>
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: '0.25rem',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '0.65rem 0.9rem',
                borderRadius:
                  msg.role === 'user'
                    ? 'var(--radius-lg) var(--radius-md) var(--radius-sm) var(--radius-lg)'
                    : 'var(--radius-md) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
                background:
                  msg.role === 'user'
                    ? 'var(--color-primary)'
                    : 'var(--color-bg)',
                color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>

            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <div
                style={{
                  maxWidth: '80%',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  padding: '0.4rem 0.75rem',
                  background: 'var(--color-primary-light)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--color-primary)',
                }}
              >
                <strong>Sources:</strong>{' '}
                {(msg.sources as string[]).map((s, i) => (
                  <span key={i}>{typeof s === 'string' ? s : JSON.stringify(s)}{i < msg.sources!.length - 1 ? ' · ' : ''}</span>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
            <span className='typing-dot' style={{ display: 'inline-flex', gap: '3px' }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                    opacity: 0.6,
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
            <span>Thinking…</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--color-error)', fontSize: '0.85rem', padding: '0.5rem 0.75rem', background: '#fce8e6', borderRadius: 'var(--radius-sm)' }}>
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '0.75rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          background: 'var(--color-surface)',
        }}
      >
        <input
          type='text'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            specialistId
              ? `Ask a ${specialistId} question…`
              : 'Ask a medical question…'
          }
          disabled={loading}
          style={{
            flex: 1,
            padding: '0.6rem 0.9rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: '0.9rem',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
        />
        <button
          type='submit'
          disabled={loading || !input.trim()}
          style={{
            padding: '0.6rem 1.2rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--color-primary)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9rem',
            opacity: loading || !input.trim() ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          Send
        </button>
      </form>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
