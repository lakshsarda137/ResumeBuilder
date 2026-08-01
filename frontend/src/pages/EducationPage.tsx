import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ChevronDown, ChevronUp, Loader2, Pencil, Check, X,
} from 'lucide-react';
import { RepoImportPanel } from '../components/RepoImportPanel';
import { ClearAllButton } from '../components/ClearAllButton';
import type { EducationItem, EducationMeta } from '../types/education';
import '../components/Layout.css';
import './EducationPage.css';

interface FormState {
  school: string;
  degree: string;
  major: string;
  grad_date: string;
  gpa: string;
  location: string;
  coursework: string;
}

const EMPTY_FORM: FormState = {
  school: '', degree: '', major: '', grad_date: '', gpa: '', location: '', coursework: '',
};

function itemToForm(item: EducationItem): FormState {
  return {
    school: item.school,
    degree: item.degree ?? '',
    major: item.major ?? '',
    grad_date: item.grad_date ?? '',
    gpa: item.gpa ?? '',
    location: item.location ?? '',
    coursework: item.coursework,
  };
}

export function EducationPage() {
  const [items, setItems] = useState<EducationItem[]>([]);
  const [meta, setMeta] = useState<EducationMeta>({ skills_note: '', other_notes: '' });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [metaDraft, setMetaDraft] = useState<EducationMeta>({ skills_note: '', other_notes: '' });
  const [metaSaving, setMetaSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch('/api/education');
    const data = await r.json();
    const normalizedMeta: EducationMeta = {
      skills_note: data.meta?.skills_note ?? '',
      other_notes: data.meta?.other_notes ?? '',
    };
    setItems(data.items ?? []);
    setMeta(normalizedMeta);
    setMetaDraft(normalizedMeta);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/education', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } finally { setSaving(false); }
  };

  const startEdit = (item: EducationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditForm(itemToForm(item));
    setExpandedId(item.id);
  };

  const saveEdit = async (id: string) => {
    setEditSaving(true);
    try {
      const r = await fetch(`/api/education/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const updated: EducationItem = await r.json();
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      setEditingId(null);
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this education record?')) return;
    await fetch(`/api/education/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const saveMeta = async () => {
    setMetaSaving(true);
    try {
      const r = await fetch('/api/education/meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaDraft),
      });
      const updated: EducationMeta = await r.json();
      setMeta(updated);
      setMetaDraft(updated);
      setShowMetaForm(false);
      setMetaExpanded(
        updated.skills_note.trim().length > 0 ||
          updated.other_notes.trim().length > 0,
      );
    } finally { setMetaSaving(false); }
  };

  const toggleMetaForm = () => {
    setMetaDraft(meta);
    setMetaExpanded(true);
    setShowMetaForm(v => !v);
  };

  const cancelMetaEdit = () => {
    setMetaDraft(meta);
    setShowMetaForm(false);
  };

  const metaDirty =
    metaDraft.skills_note !== meta.skills_note ||
    metaDraft.other_notes !== meta.other_notes;

  const metaHasContent =
    meta.skills_note.trim().length > 0 ||
    meta.other_notes.trim().length > 0;

  const hasAnyContent =
    items.length > 0 ||
    meta.skills_note.trim().length > 0 ||
    meta.other_notes.trim().length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Education Info</h1>
        <p className="page-subtitle">
          Degrees, GPA, relevant coursework, and skills — kept separate from experience/project warehouse.
        </p>
      </div>

      <div className="education-toolbar">
        <ClearAllButton
            apiPath="/api/education"
          confirmMessage="Delete ALL education records and skills notes? This cannot be undone."
          disabled={loading || !hasAnyContent}
          onComplete={load}
        />
        <RepoImportPanel onComplete={load} />
        <button className="btn btn--ghost" onClick={toggleMetaForm}>
          {metaHasContent ? <Pencil size={15} /> : <Plus size={15} />}
          {metaHasContent ? 'Edit notes' : 'Add notes'}
        </button>
        <button className="btn btn--primary" onClick={() => setShowForm(v => !v)}>
          <Plus size={15} /> Add school
        </button>
      </div>

      {showForm && (
        <div className="card education-form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="field">
                <label>School *</label>
                <input value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
                  placeholder="University of Example" required />
              </div>
              <div className="field">
                <label>Degree</label>
                <input value={form.degree} onChange={e => setForm(f => ({ ...f, degree: e.target.value }))}
                  placeholder="B.S. Computer Science" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Major</label>
                <input value={form.major} onChange={e => setForm(f => ({ ...f, major: e.target.value }))}
                  placeholder="Computer Science" />
              </div>
              <div className="field">
                <label>GPA</label>
                <input value={form.gpa} onChange={e => setForm(f => ({ ...f, gpa: e.target.value }))}
                  placeholder="3.85 / 4.0" />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>Graduation</label>
                <input value={form.grad_date} onChange={e => setForm(f => ({ ...f, grad_date: e.target.value }))}
                  placeholder="2026-05 or May 2026" />
              </div>
              <div className="field">
                <label>Location</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="City, State" />
              </div>
            </div>
            <div className="field">
              <label>Coursework, honors &amp; notes</label>
              <textarea rows={4} value={form.coursework} onChange={e => setForm(f => ({ ...f, coursework: e.target.value }))}
                placeholder="Data Structures, Algorithms, Dean's List, capstone project…" />
            </div>
            <div className="education-form-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showMetaForm && (
        <div className="card education-meta-card">
          <h2 className="education-section-title">Skills &amp; other notes</h2>
          <p className="education-section-sub">Languages, tools, certifications, awards — not tied to one school.</p>
          <div className="education-meta-fields">
            <div className="field">
              <label>Skills &amp; certifications</label>
              <textarea rows={3} value={metaDraft.skills_note}
                onChange={e => setMetaDraft(m => ({ ...m, skills_note: e.target.value }))}
                placeholder="Python, TypeScript, AWS, React…" />
            </div>
            <div className="field">
              <label>Other notes</label>
              <textarea rows={3} value={metaDraft.other_notes}
                onChange={e => setMetaDraft(m => ({ ...m, other_notes: e.target.value }))}
                placeholder="Work authorization, awards, publications…" />
            </div>
          </div>
          <div className="education-form-actions">
            <button type="button" className="btn btn--ghost" onClick={cancelMetaEdit}>Cancel</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={saveMeta}
              disabled={metaSaving || !metaDirty}
            >
              {metaSaving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {metaSaving ? 'Saving…' : metaDirty ? 'Save notes' : 'Saved'}
            </button>
          </div>
        </div>
      )}

      {!showMetaForm && metaHasContent && (
        <div className="card education-meta-card education-meta-card--summary">
          <div
            className="education-meta-header education-meta-header--clickable"
            role="button"
            tabIndex={0}
            onClick={() => setMetaExpanded(v => !v)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMetaExpanded(v => !v);
              }
            }}
          >
            <div>
              <h2 className="education-section-title">Skills &amp; other notes</h2>
              <p className="education-section-sub">Stored education-adjacent details for resume generation.</p>
            </div>
            <div className="education-item-right">
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={e => {
                  e.stopPropagation();
                  toggleMetaForm();
                }}
              >
                <Pencil size={13} /> Edit
              </button>
              {metaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
          {metaExpanded && (
            <div className="education-meta-summary education-meta-body">
              {meta.skills_note.trim() && (
                <div>
                  <p className="education-meta-label">Skills &amp; certifications</p>
                  <pre>{meta.skills_note}</pre>
                </div>
              )}
              {meta.other_notes.trim() && (
                <div>
                  <p className="education-meta-label">Other notes</p>
                  <pre>{meta.other_notes}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="education-list-area">
        {loading ? (
          <div className="empty-state"><Loader2 size={24} className="spin" /></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><p>No education records yet. Add manually or import a resume/LinkedIn.</p></div>
        ) : (
          <div className="education-list">
          {items.map(item => {
            const isExpanded = expandedId === item.id;
            const isEditing = editingId === item.id;
            const headline = [item.degree, item.major ? `in ${item.major}` : ''].filter(Boolean).join(' ');
            return (
              <div key={item.id} className="card education-item">
                <div className="education-item-header" onClick={() => !isEditing && setExpandedId(id => id === item.id ? null : item.id)}>
                  <div>
                    <h3 className="education-item-title">{item.school}</h3>
                    {headline ? <p className="education-item-sub">{headline}</p> : null}
                    <p className="education-item-meta">
                      {[item.grad_date && `Grad ${item.grad_date}`, item.gpa && `GPA ${item.gpa}`, item.location]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="education-item-right">
                    <button className="btn btn--sm btn--ghost" title="Edit" onClick={e => startEdit(item, e)}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn btn--sm btn--danger" onClick={e => { e.stopPropagation(); handleDelete(item.id); }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="education-item-body" onClick={e => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="education-edit-form">
                        <div className="form-row">
                          <div className="field">
                            <label>School</label>
                            <input value={editForm.school} onChange={e => setEditForm(f => ({ ...f, school: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>Degree</label>
                            <input value={editForm.degree} onChange={e => setEditForm(f => ({ ...f, degree: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Major</label>
                            <input value={editForm.major} onChange={e => setEditForm(f => ({ ...f, major: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>GPA</label>
                            <input value={editForm.gpa} onChange={e => setEditForm(f => ({ ...f, gpa: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="field">
                            <label>Graduation</label>
                            <input value={editForm.grad_date} onChange={e => setEditForm(f => ({ ...f, grad_date: e.target.value }))} />
                          </div>
                          <div className="field">
                            <label>Location</label>
                            <input value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
                          </div>
                        </div>
                        <div className="field">
                          <label>Coursework, honors &amp; notes</label>
                          <textarea rows={5} value={editForm.coursework} onChange={e => setEditForm(f => ({ ...f, coursework: e.target.value }))} />
                        </div>
                        <div className="education-form-actions">
                          <button className="btn btn--ghost" onClick={() => setEditingId(null)}><X size={13} /> Cancel</button>
                          <button className="btn btn--primary" onClick={() => saveEdit(item.id)} disabled={editSaving}>
                            {editSaving ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="education-coursework">{item.coursework || 'No coursework or notes yet.'}</pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
