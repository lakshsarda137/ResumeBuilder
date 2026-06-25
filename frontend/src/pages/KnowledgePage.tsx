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
        <BookOpen size={32} style={{ opacity: 0.3 }} />
        <p>Coming soon.</p>
      </div>
    </div>
  );
}
