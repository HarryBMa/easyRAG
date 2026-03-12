import { useState } from 'react';
import { ChatInterface } from '../components/ChatInterface';
import { SpecialistSelector } from '../components/SpecialistSelector';

export default function IndexPage() {
  const [selectedSpecialist, setSelectedSpecialist] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
      <section>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text)' }}>
          Medical AI Assistant
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Select a specialist role, then ask a question about your uploaded documents.
        </p>
        <SpecialistSelector
          selectedId={selectedSpecialist}
          onSelect={setSelectedSpecialist}
        />
      </section>

      <section style={{ flex: 1, minHeight: 0 }}>
        <ChatInterface specialistId={selectedSpecialist} />
      </section>
    </div>
  );
}
