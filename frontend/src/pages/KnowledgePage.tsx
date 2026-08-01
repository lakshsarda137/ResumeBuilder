import { BookOpen } from 'lucide-react';
import '../components/Layout.css';

export function KnowledgePage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Knowledge Docs</h1>
        <p className="page-subtitle">Store notes, frameworks, and reference material that inform your resume writing.</p>
      </div>
      <div className="empty-state">
        <BookOpen size={32} />
        <p>Coming soon.</p>
        <p className="empty-state__hint">
          Reference material you save here will be available to the resume and
          cover letter prompts.
        </p>
      </div>
    </div>
  );
}
