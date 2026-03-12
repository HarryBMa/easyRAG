import { useCallback, useRef, useState } from 'react';
import { api, type Document } from '../lib/api';

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.pptx', '.xlsx',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff',
  '.txt', '.md',
];

const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: Document;
}

interface DocumentUploadProps {
  onUploadComplete?: () => void;
}

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const processFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, file, status: 'pending' }]);
    updateItem(id, { status: 'uploading' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const doc = await api.upload<Document>('/api/documents', formData);
      updateItem(id, { status: 'success', result: doc });
      onUploadComplete?.();
    } catch (err: unknown) {
      const msg = (err as { detail?: string }).detail ?? 'Upload failed';
      updateItem(id, { status: 'error', error: msg });
    }
  }, [onUploadComplete]);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      for (const file of Array.from(fileList)) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          const id = crypto.randomUUID();
          setItems((prev) => [
            ...prev,
            { id, file, status: 'error', error: `File type '${ext}' is not supported` },
          ]);
          continue;
        }
        processFile(file);
      }
    },
    [processFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const statusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'uploading': return '⬆️';
      case 'success': return '✅';
      case 'error': return '❌';
    }
  };

  const statusColor = (status: UploadItem['status']) => {
    switch (status) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      default: return 'var(--color-text-secondary)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Drop zone */}
      <div
        role='button'
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
          background: dragging ? 'var(--color-primary-light)' : 'var(--color-surface)',
          padding: '3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{ fontSize: '3rem' }}>📄</span>
        <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--color-text)' }}>
          Drag & drop files here, or <span style={{ color: 'var(--color-primary)' }}>browse</span>
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          Supported: {ACCEPTED_EXTENSIONS.join(', ')}
        </p>
      </div>

      <input
        ref={inputRef}
        type='file'
        multiple
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Upload list */}
      {items.length > 0 && (
        <div
          style={{
            background: 'var(--color-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <span>{statusIcon(item.status)}</span>
              <span
                style={{
                  flex: 1,
                  fontSize: '0.875rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.file.name}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: statusColor(item.status),
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.status === 'error'
                  ? item.error
                  : item.status === 'success'
                    ? item.result?.status ?? 'Uploaded'
                    : item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {items.some((i) => i.status === 'success') && (
        <p style={{ fontSize: '0.85rem', color: 'var(--color-success)' }}>
          ✓ Files uploaded successfully. Processing may take a moment.
        </p>
      )}
    </div>
  );
}
