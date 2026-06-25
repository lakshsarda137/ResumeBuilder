import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, CheckCircle, ChevronDown, ChevronUp,
  Loader2, MessageSquare, Pencil, Check, X,
} from 'lucide-react';
import { RepoImportPanel } from '../components/RepoImportPanel';
import { ClearAllButton } from '../components/ClearAllButton';
import '../components/Layout.css';
import './OngoingPage.css';

type ItemType = 'experience' | 'project';

interface Reflection {
  id: string;
  ongoing_item_id: string;
  content: string;
  created_at: string;
}

interface OngoingItem {
  id: string;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  status: 'active' | 'done';
  end_date: string | null;
  compiled: string | null;
  created_at: string;
  reflections: Reflection[];
}

interface AddForm { type: ItemType; title: string; company: string; position: string; start_date: string; }
const EMPTY_ADD: AddForm = { type: 'experience', title: '', company: '', position: '', start_date: '' };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function patchOngoing(id: string, body: object) {
  const r = await fetch(`/api/ongoing/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}

async function patchReflection(itemId: string, rid: string, content: string) {
  const r = await fetch(`/api/ongoing/${itemId}/reflection/${rid}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
  });
  return r.json();
}

export function OngoingPage() {
  const [items, setItems] = useState<OngoingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(EMPTY_ADD);
  const [addSaving, setAddSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState<Record<string, string>>({});
  const [addingRef, setAddingRef] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');

  // Item-level editing
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState<Partial<OngoingItem>>({});
  const [editItemSaving, setEditItemSaving] = useState(false);

  // Reflection editing
  const [editRefId, setEditRefId] = useState<string | null>(null);
  const [editRefDraft, setEditRefDraft] = useState('');
  const [editRefSaving, setEditRefSaving] = useState(false);

  // Compiled editing
  const [editCompiledId, setEditCompiledId] = useState<string | null>(null);
  const [editCompiledDraft, setEditCompiledDraft] = useState('');
  const [editCompiledSaving, setEditCompiledSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/ongoing');
    setItems(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title.trim()) return;
    setAddSaving(true);
    try {
      await fetch('/api/ongoing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addForm),
      });
      setAddForm(EMPTY_ADD);
      setShowForm(false);
      await load();
    } finally { setAddSaving(false); }
  };

  const handleAddReflection = async (itemId: string) => {
    const content = reflectionDraft[itemId]?.trim();
    if (!content) return;
    setAddingRef(r => ({ ...r, [itemId]: true }));
    try {
      const r = await fetch(`/api/ongoing/${itemId}/reflection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
      const newRef: Reflection = await r.json();
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, reflections: [...i.reflections, newRef] } : i));
      setReflectionDraft(d => ({ ...d, [itemId]: '' }));
    } finally { setAddingRef(r => ({ ...r, [itemId]: false })); }
  };

  const handleDeleteReflection = async (itemId: string, rid: string) => {
    if (!window.confirm('Delete this reflection?')) return;
    await fetch(`/api/ongoing/${itemId}/reflection/${rid}`, { method: 'DELETE' });
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, reflections: i.reflections.filter(r => r.id !== rid) } : i));
  };

  const handleSaveReflection = async (itemId: string, rid: string) => {
    if (!editRefDraft.trim()) return;
    setEditRefSaving(true);
    try {
      const updated: Reflection = await patchReflection(itemId, rid, editRefDraft);
      setItems(prev => prev.map(i => i.id === itemId
        ? { ...i, reflections: i.reflections.map(r => r.id === rid ? updated : r) }
        : i));
      setEditRefId(null);
    } finally { setEditRefSaving(false); }
  };

  const handleSaveItemEdit = async (id: string) => {
    setEditItemSaving(true);
    try {
      await patchOngoing(id, editItemForm);
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...editItemForm } : i));
      setEditItemId(null);
    } finally { setEditItemSaving(false); }
  };

  const handleSaveCompiled = async (id: string) => {
    setEditCompiledSaving(true);
    try {
      await patchOngoing(id, { compiled: editCompiledDraft });
      setItems(prev => prev.map(i => i.id === id ? { ...i, compiled: editCompiledDraft } : i));
      setEditCompiledId(null);
    } finally { setEditCompiledSaving(false); }
  };

  const handleComplete = async (item: OngoingItem) => {
    const end = window.prompt(`Mark "${item.title}" as done.\nEnd date (YYYY-MM-DD):`, new Date().toISOString().slice(0, 10));
    if (!end) return;
    const r = await fetch(`/api/ongoing/${item.id}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ end_date: end }),
    });
    const updated = await r.json();
    setItems(prev => prev.map(i => i.id === item.id ? { ...updated, reflections: item.reflections } : i));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this entry and all its reflections?')) return;
    await fetch(`/api/ongoing/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = items.filter(i => filter === 'all' ? true : i.status === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ongoing</h1>
        <p className="page-subtitle">Track current work. Add reflections as you go — compiled into a freewrite when you&rsquo;re done.</p>
      </div>

      <div className="ongoing-toolbar">
        <div className="repo-filter">
          {(['active', 'done', 'all'] as const).map(f => (
            <button key={f} className={`repo-filter-btn${filter === f ? ' repo-filter-btn--active' : ''}`} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="ongoing-toolbar-actions">
          <ClearAllButton
            apiPath="/api/ongoing"
            confirmMessage="Delete ALL ongoing items and reflections? This cannot be undone."
            disabled={loading || items.length === 0}
            onComplete={() => {
              setExpandedId(null);
              setEditItemId(null);
              load();
            }}
          />
          <RepoImportPanel onComplete={load} />
          <button className="btn btn--primary" onClick={() => setShowForm(v => !v)}>
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card ongoing-form-card">
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="field">
                <label>Type</label>
                <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value as ItemType }))}>
                  <option value="experience">Experience</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <div className="field">
                <label>Title / Role *</label>
                <input value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="iOS App · Research Assistant" required />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Company / Context</label>
                <input value={addForm.company} onChange={e => setAddForm(f => ({ ...f, company: e.target.value }))} placeholder="Acme Corp · Personal" />
              </div>
              <div className="field">
                <label>Start date</label>
                <input type="month" value={addForm.start_date} onChange={e => setAddForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="ongoing-form-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={addSaving}>
                {addSaving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {addSaving ? 'Saving…' : 'Start tracking'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><Loader2 size={24} className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>{filter === 'active' ? 'Nothing active right now.' : 'Nothing here yet.'}</p></div>
      ) : (
        <div className="ongoing-list">
          {filtered.map(item => {
            const isExpanded = expandedId === item.id;
            const isEditingItem = editItemId === item.id;
            return (
              <div key={item.id} className={`card ongoing-item${item.status === 'done' ? ' ongoing-item--done' : ''}`}>
                <div className="ongoing-item-header" onClick={() => !isEditingItem && setExpandedId(id => id === item.id ? null : item.id)}>
                  <div className="ongoing-item-top">
                    <div>
                      <div className="ongoing-item-meta">
                        <span className={`badge badge--${item.type === 'experience' ? 'amber' : 'green'}`}>{item.type}</span>
                        <span className={`badge badge--${item.status === 'active' ? 'green' : 'neutral'}`}>{item.status}</span>
                      </div>
                      <h3 className="ongoing-item-title">{item.title}</h3>
                      {(item.company || item.position) && (
                        <p className="ongoing-item-sub">{[item.position, item.company].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <div className="ongoing-item-right">
                      <span className="ongoing-item-date">{item.start_date ?? '?'}{item.end_date ? ` – ${item.end_date}` : ' – present'}</span>
                      <span className="ongoing-refl-count"><MessageSquare size={13} /> {item.reflections.length}</span>
                      <button className="btn btn--sm btn--ghost" title="Edit metadata" onClick={e => { e.stopPropagation(); setEditItemId(item.id); setEditItemForm({ type: item.type, title: item.title, company: item.company ?? '', position: item.position ?? '', start_date: item.start_date ?? '', end_date: item.end_date ?? '' }); setExpandedId(item.id); }}>
                        <Pencil size={13} />
                      </button>
                      {item.status === 'active' && (
                        <button className="btn btn--sm btn--secondary" title="Mark as done" onClick={e => { e.stopPropagation(); handleComplete(item); }}>
                          <CheckCircle size={13} /> Done
                        </button>
                      )}
                      <button className="btn btn--sm btn--danger" onClick={e => { e.stopPropagation(); handleDelete(item.id); }} title="Delete">
                        <Trash2 size={13} />
                      </button>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="ongoing-expanded" onClick={e => e.stopPropagation()}>
                    <div className="divider" />

                    {/* Edit item metadata */}
                    {isEditingItem && (
                      <div className="ongoing-edit-meta">
                        <div className="form-row">
                          <div className="field">
                            <label>Type</label>
                            <select value={editItemForm.type ?? 'experience'} onChange={e => setEditItemForm(f => ({ ...f, type: e.target.value as ItemType }))}>
                              <option value="experience">Experience</option>
                              <option value="project">Project</option>
                            </select>
                          </div>
                          <div className="field">
                            <label>Title</label>
                            <input value={editItemForm.title ?? ''} onChange={e => setEditItemForm(f => ({ ...f, title: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Company</label>
                            <input value={(editItemForm.company as string) ?? ''} onChange={e => setEditItemForm(f => ({ ...f, company: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>Position</label>
                            <input value={(editItemForm.position as string) ?? ''} onChange={e => setEditItemForm(f => ({ ...f, position: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Start date</label>
                            <input type="month" value={(editItemForm.start_date as string) ?? ''} onChange={e => setEditItemForm(f => ({ ...f, start_date: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>End date</label>
                            <input type="month" value={(editItemForm.end_date as string) ?? ''} onChange={e => setEditItemForm(f => ({ ...f, end_date: e.target.value }))} />
                          </div>
                        </div>
                        <div className="ongoing-form-actions">
                          <button className="btn btn--ghost" onClick={() => setEditItemId(null)}><X size={13} /> Cancel</button>
                          <button className="btn btn--primary" onClick={() => handleSaveItemEdit(item.id)} disabled={editItemSaving}>
                            {editItemSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Save
                          </button>
                        </div>
                        <div className="divider" />
                      </div>
                    )}

                    {/* Reflections */}
                    <div className="ongoing-reflections">
                      {item.reflections.length === 0 ? (
                        <p className="ongoing-no-reflections">No reflections yet.</p>
                      ) : (
                        item.reflections.map(r => (
                          <div key={r.id} className="ongoing-reflection">
                            <div className="ongoing-reflection-header">
                              <span className="ongoing-reflection-date">{fmtDate(r.created_at)}</span>
                              <div className="ongoing-reflection-actions">
                                <button className="btn btn--sm btn--ghost" title="Edit" onClick={() => { setEditRefId(r.id); setEditRefDraft(r.content); }}>
                                  <Pencil size={12} />
                                </button>
                                <button className="btn btn--sm btn--danger" title="Delete" onClick={() => handleDeleteReflection(item.id, r.id)}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            {editRefId === r.id ? (
                              <div className="ongoing-ref-edit">
                                <textarea rows={3} value={editRefDraft} onChange={e => setEditRefDraft(e.target.value)} />
                                <div className="ongoing-ref-edit-actions">
                                  <button className="btn btn--ghost btn--sm" onClick={() => setEditRefId(null)}><X size={12} /> Cancel</button>
                                  <button className="btn btn--primary btn--sm" disabled={editRefSaving} onClick={() => handleSaveReflection(item.id, r.id)}>
                                    {editRefSaving ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="ongoing-reflection-text">{r.content}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add reflection */}
                    {item.status === 'active' && (
                      <div className="ongoing-add-reflection">
                        <textarea rows={3} placeholder="What did you work on? Wins, learnings, numbers to remember?"
                          value={reflectionDraft[item.id] ?? ''}
                          onChange={e => setReflectionDraft(d => ({ ...d, [item.id]: e.target.value }))} />
                        <button className="btn btn--primary btn--sm" disabled={!reflectionDraft[item.id]?.trim() || addingRef[item.id]} onClick={() => handleAddReflection(item.id)}>
                          {addingRef[item.id] ? <Loader2 size={13} className="spin" /> : <Plus size={13} />} Add reflection
                        </button>
                      </div>
                    )}

                    {/* Compiled freewrite */}
                    {item.status === 'done' && (
                      <div className="ongoing-compiled">
                        <div className="ongoing-compiled-header">
                          <p className="ongoing-compiled-label">Compiled freewrite</p>
                          {editCompiledId === item.id ? (
                            <div className="ongoing-ref-edit-actions">
                              <button className="btn btn--ghost btn--sm" onClick={() => setEditCompiledId(null)}><X size={12} /> Cancel</button>
                              <button className="btn btn--primary btn--sm" disabled={editCompiledSaving} onClick={() => handleSaveCompiled(item.id)}>
                                {editCompiledSaving ? <Loader2 size={12} className="spin" /> : <Check size={12} />} Save
                              </button>
                            </div>
                          ) : (
                            <button className="btn btn--ghost btn--sm" onClick={() => { setEditCompiledId(item.id); setEditCompiledDraft(item.compiled ?? ''); }}>
                              <Pencil size={12} /> Edit
                            </button>
                          )}
                        </div>
                        {editCompiledId === item.id ? (
                          <textarea className="ongoing-compiled-textarea" rows={8} value={editCompiledDraft} onChange={e => setEditCompiledDraft(e.target.value)} />
                        ) : (
                          <pre>{item.compiled || '(empty)'}</pre>
                        )}
                      </div>
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
