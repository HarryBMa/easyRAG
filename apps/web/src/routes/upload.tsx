import { useNavigate } from '@tanstack/react-router';
import { DocumentUpload } from '../components/DocumentUpload';

export default function UploadPage() {
  const navigate = useNavigate();

  function handleUploadComplete() {
    setTimeout(() => navigate({ to: '/documents' }), 1500);
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Upload Documents
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
        Upload PDFs, Office files, images, or text files for RAG processing.
      </p>
      <DocumentUpload onUploadComplete={handleUploadComplete} />
    </div>
  );
}
