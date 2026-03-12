import { useCallback, useEffect, useState } from 'react';
import { api, type Document } from '../lib/api';

const STATUS_COLORS: Record<string, string> = {
  ready: 'var(--color-success)',
  processing: 'var(--color-warning)',
  error: 'var(--color-error)',
};

const STATUS_ICONS: Record<string, string> = {
  ready: '✅',
  processing: '⏳',
  error: '❌',
};

export function DocumentList() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocs = useCallback(() => {
    setLoading(true);
    api
      .get<Document[]>('/api/documents')
      .then(setDocs)
      .catch((e: { detail?: string }) => setError(e.detail ?? 'Failed to load documents'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function handleDelete(id: string) {
    if (!confirm('Remove this document?')) return;
    setDeleting(id);
    try {
      await api.delete(`/api/documents/${id}`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e: unknown) {
      alert((e as { detail?: string }).detail ?? 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--color-text-secondary)' }}>Loading documents…</div>;
  }

  if (error) {
    return <div style={{ color: 'var(--color-error)' }}>Error: {error}</div>;
  }

  if (docs.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📂</div>
        <p>No documents yet. <a href='/upload'>Upload one</a> to get started.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          fontSize: '0.875rem',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
            {['Name', 'Status', 'Uploaded', 'Actions'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '0.75rem 1rem',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr
              key={doc.id}
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                📄 {doc.name}
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    color: STATUS_COLORS[doc.status] ?? 'var(--color-text-secondary)',
                    fontWeight: 500,
                    fontSize: '0.8rem',
                  }}
                >
                  {STATUS_ICONS[doc.status] ?? '❓'} {doc.status}
                </span>
                {doc.status === 'error' && doc.error && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-error)', marginTop: '0.2rem' }}>
                    {doc.error}
                  </div>
                )}
              </td>
              <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)' }}>
                {new Date(doc.created_at).toLocaleString()}
              </td>
              <td style={{ padding: '0.75rem 1rem' }}>
                <button
                  type='button'
                  disabled={deleting === doc.id}
                  onClick={() => handleDelete(doc.id)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-error)',
                    background: 'none',
                    color: 'var(--color-error)',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    opacity: deleting === doc.id ? 0.5 : 1,
                  }}
                >
                  {deleting === doc.id ? 'Removing…' : 'Remove'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type='button'
          onClick={fetchDocs}
          style={{
            padding: '0.4rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
