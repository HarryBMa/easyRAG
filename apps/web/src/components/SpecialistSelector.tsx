import { useEffect, useState } from 'react';
import { api, type Specialist } from '../lib/api';

interface SpecialistSelectorProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function SpecialistSelector({ selectedId, onSelect }: SpecialistSelectorProps) {
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Specialist[]>('/api/specialists')
      .then(setSpecialists)
      .catch((e: { detail?: string }) => setError(e.detail ?? 'Failed to load specialists'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ color: 'var(--color-text-secondary)', padding: '1rem 0' }}>
        Loading specialists…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: 'var(--color-error)', padding: '1rem 0' }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {specialists.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <button
              key={s.id}
              type='button'
              onClick={() => onSelect(isSelected ? null : s.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.85rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: isSelected
                  ? '2px solid var(--color-primary)'
                  : '1px solid var(--color-border)',
                background: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              }}
            >
              <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{s.icon}</span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  color: isSelected ? 'var(--color-primary-dark)' : 'var(--color-text)',
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {s.name}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                {s.description}
              </span>
            </button>
          );
        })}
      </div>

      {selectedId && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-primary)' }}>
          ✓ Responding as{' '}
          <strong>{specialists.find((s) => s.id === selectedId)?.name}</strong>
          {' '}—{' '}
          <button
            type='button'
            onClick={() => onSelect(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 'inherit',
              padding: 0,
            }}
          >
            clear
          </button>
        </p>
      )}
    </div>
  );
}
