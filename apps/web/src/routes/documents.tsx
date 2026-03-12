import { DocumentList } from '../components/DocumentList';

export default function DocumentsPage() {
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Documents
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
        Manage your uploaded and processed documents.
      </p>
      <DocumentList />
    </div>
  );
}
