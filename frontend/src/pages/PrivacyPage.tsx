import { Shield } from 'lucide-react';
import '../components/Layout.css';

export function PrivacyPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Privacy</h1>
        <p className="page-subtitle">Everything stays on your machine. Here&rsquo;s exactly where your data lives.</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Shield size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>100% local — no cloud</h3>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.65 }}>
              Resume Builder never sends your data to any server we control. Your resume, repository
              entries, reflections, and version history are stored exclusively on your machine.
            </p>
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Resume state', where: 'Browser localStorage (key: resume-editor-data)' },
            { label: 'Repository, Ongoing, History', where: '~/.resume-builder/data.db (SQLite)' },
            { label: 'AI chat sessions', where: 'Browser localStorage + Chrome extension storage' },
            { label: 'AI prompts & responses', where: 'Sent directly from your browser to the LLM provider — never routed through this app\'s backend' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{item.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'monospace' }}>{item.where}</span>
            </div>
          ))}
        </div>

        <div className="divider" />

        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', lineHeight: 1.65 }}>
          The Express API server (port 3001) only listens on localhost and is never exposed to the internet.
          To delete all data, remove the <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4 }}>~/.resume-builder/</code> directory
          and clear your browser&rsquo;s localStorage for this origin.
        </p>
      </div>
    </div>
  );
}
