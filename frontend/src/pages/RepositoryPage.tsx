import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2, Lightbulb, Pencil, Check, X } from 'lucide-react';
import { RepoImportPanel } from '../components/RepoImportPanel';
import { ClearAllButton } from '../components/ClearAllButton';
import '../components/Layout.css';
import './RepositoryPage.css';

type Mode = 'optimized' | 'freewrite';
type ItemType = 'experience' | 'project';

interface RepoItem {
  id: string;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  mode: Mode;
  content: string;
  created_at: string;
}

interface FormState {
  type: ItemType;
  title: string;
  company: string;
  position: string;
  start_date: string;
  end_date: string;
  mode: Mode;
  content: string;
}

const EMPTY_FORM: FormState = {
  type: 'experience', title: '', company: '', position: '',
  start_date: '', end_date: '', mode: 'optimized', content: '',
};

const OPTIMIZED_TIPS = [
  'Start each bullet with a strong action verb (led, built, reduced, increased…)',
  'Include numbers wherever possible — percentages, user counts, time saved',
  'Format bullets as: Action + What + Result',
  'Aim for 3–5 bullets; each under 2 lines',
];

function itemToForm(item: RepoItem): FormState {
  return {
    type: item.type, title: item.title, company: item.company ?? '',
    position: item.position ?? '', start_date: item.start_date ?? '',
    end_date: item.end_date ?? '', mode: item.mode, content: item.content,
  };
}

export function RepositoryPage() {
  const [items, setItems] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | ItemType>('all');

  const load = useCallback(async () => {
    const r = await fetch('/api/repo');
    setItems(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  };

  const startEdit = (item: RepoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditForm(itemToForm(item));
    setExpandedId(item.id);
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async (id: string) => {
    setEditSaving(true);
    try {
      const r = await fetch(`/api/repo/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const updated: RepoItem = await r.json();
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setEditingId(null);
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    await fetch(`/api/repo/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Repository</h1>
        <p className="page-subtitle">Your experience &amp; project warehouse. Not everything here goes on a resume.</p>
      </div>

      <div className="repo-toolbar">
        <div className="repo-filter">
          {(['all', 'experience', 'project'] as const).map(f => (
            <button key={f} className={`repo-filter-btn${filter === f ? ' repo-filter-btn--active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
            </button>
          ))}
        </div>
        <div className="repo-toolbar-actions">
          <ClearAllButton
            apiPath="/api/repo"
            confirmMessage="Delete ALL repository entries? This cannot be undone."
            disabled={loading || items.length === 0}
            onComplete={() => {
              setExpandedId(null);
              setEditingId(null);
              load();
            }}
          />
          <RepoImportPanel onComplete={load} />
          <button className="btn btn--primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={15} /> Add entry
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card repo-form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="field">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ItemType }))}>
                  <option value="experience">Experience</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <div className="field">
                <label>Title / Role *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={form.type === 'experience' ? 'Software Engineer Intern' : 'ResumeOS'} required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>{form.type === 'experience' ? 'Company' : 'Organisation / Context'}</label>
                <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                  placeholder={form.type === 'experience' ? 'Acme Corp' : 'Personal · Hackathon'} />
              </div>
              <div className="field">
                <label>Position / Team</label>
                <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="Backend team" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Start date</label>
                <input type="month" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="field">
                <label>End date</label>
                <input type="month" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} placeholder="Leave blank if ongoing" />
              </div>
            </div>
            <div className="repo-mode-toggle">
              <button type="button" className={`repo-mode-btn${form.mode === 'optimized' ? ' repo-mode-btn--active' : ''}`} onClick={() => setForm(f => ({ ...f, mode: 'optimized' }))}>Resume-optimized bullets</button>
              <button type="button" className={`repo-mode-btn${form.mode === 'freewrite' ? ' repo-mode-btn--active' : ''}`} onClick={() => setForm(f => ({ ...f, mode: 'freewrite' }))}>Freewrite (AI will optimize later)</button>
            </div>
            {form.mode === 'optimized' && (
              <div className="repo-tips">
                <Lightbulb size={13} />
                <ul>{OPTIMIZED_TIPS.map(tip => <li key={tip}>{tip}</li>)}</ul>
              </div>
            )}
            <div className="field">
              <label>{form.mode === 'optimized' ? 'Resume bullets (one per line)' : 'Freewrite — tell the full story'}</label>
              <textarea rows={5} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={form.mode === 'optimized'
                  ? '• Led migration of monolith to microservices, reducing p99 latency by 40%\n• Owned CI/CD pipeline…'
                  : 'I spent most of the summer working on the checkout system…'} />
            </div>
            <div className="repo-form-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {saving ? 'Saving…' : 'Save entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><Loader2 size={24} className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No entries yet. Add your first experience or project above.</p></div>
      ) : (
        <div className="repo-list">
          {filtered.map(item => {
            const isExpanded = expandedId === item.id;
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className="repo-item card">
                <div className="repo-item-header" onClick={() => !isEditing && setExpandedId(id => id === item.id ? null : item.id)}>
                  <div className="repo-item-meta">
                    <span className={`badge badge--${item.type === 'experience' ? 'amber' : 'green'}`}>{item.type}</span>
                    <span className="badge badge--neutral">{item.mode === 'optimized' ? 'resume-ready' : 'freewrite'}</span>
                    {!item.end_date && <span className="badge badge--green">ongoing</span>}
                  </div>
                  <div className="repo-item-title-row">
                    <div>
                      <h3 className="repo-item-title">{item.title}</h3>
                      {(item.company || item.position) && (
                        <p className="repo-item-sub">{[item.position, item.company].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <div className="repo-item-right">
                      {(item.start_date || item.end_date) && (
                        <span className="repo-item-date">{item.start_date ?? '?'} – {item.end_date ?? 'present'}</span>
                      )}
                      <button className="btn btn--sm btn--ghost" title="Edit" onClick={e => startEdit(item, e)}>
                        <Pencil size={13} />
                      </button>
                      <button className="btn btn--sm btn--danger" onClick={e => { e.stopPropagation(); handleDelete(item.id); }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="repo-item-content" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="repo-edit-form">
                        <div className="form-row">
                          <div className="field">
                            <label>Type</label>
                            <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as ItemType }))}>
                              <option value="experience">Experience</option>
                              <option value="project">Project</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Title / Role</label>
                            <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Company</label>
                            <input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>Position</label>
                            <input value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Start date</label>
                            <input type="month" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>End date</label>
                            <input type="month" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
                          </div>
                        </div>
                        <div className="repo-mode-toggle">
                          <button type="button" className={`repo-mode-btn${editForm.mode === 'optimized' ? ' repo-mode-btn--active' : ''}`} onClick={() => setEditForm(f => ({ ...f, mode: 'optimized' }))}>Resume-optimized</button>
                          <button type="button" className={`repo-mode-btn${editForm.mode === 'freewrite' ? ' repo-mode-btn--active' : ''}`} onClick={() => setEditForm(f => ({ ...f, mode: 'freewrite' }))}>Freewrite</button>
                        </div>
                        <div className="field">
                          <label>Content</label>
                          <textarea rows={6} value={editForm.content} onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))} />
                        </div>
                        <div className="repo-form-actions">
                          <button className="btn btn--ghost" onClick={cancelEdit}><X size={13} /> Cancel</button>
                          <button className="btn btn--primary" onClick={() => saveEdit(item.id)} disabled={editSaving}>
                            {editSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre>{item.content || <span style={{ color: 'var(--text-3)' }}>No content yet. Click edit to add.</span>}</pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
