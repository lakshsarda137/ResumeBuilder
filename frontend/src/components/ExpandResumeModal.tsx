import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Briefcase, FolderGit2, Search } from 'lucide-react';
import type { RepositorySource } from '../types/repository';
import { fetchRepositorySources } from '../utils/repositorySources';
import './ExpandResumeModal.css';

interface ExpandResumeModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (source: RepositorySource) => void;
}

export function ExpandResumeModal({ open, onClose, onSelect }: ExpandResumeModalProps) {
  const [sources, setSources] = useState<RepositorySource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RepositorySource | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuery('');
    setLoading(true);
    setError(null);
    fetchRepositorySources()
      .then(({ repo }) => {
        setSources(repo);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load repository.');
      })
      .finally(() => setLoading(false));
  }, [open]);

  /** Esc closes, which the click-the-scrim path alone did not cover. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /** Title, company and the freewrite body — the list is a flat scroll and
      grows with the repository, so it needs to be filterable. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) =>
      [s.title, s.company ?? '', s.freewrite]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [sources, query]);

  if (!open) return null;

  return (
    <div className="expand-modal-overlay" onClick={onClose}>
      <div className="expand-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add from repository">
        <div className="expand-modal-header">
          <span className="expand-modal-title">Add from Repository</span>
          <button type="button" className="expand-modal-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <p className="expand-modal-hint">
          Select an experience or project to add to your resume. The AI will write 2–4 bullets from the source notes.
        </p>

        {!loading && !error && sources.length > 0 ? (
          <label className="expand-modal-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, company or notes"
              aria-label="Filter repository entries"
              autoFocus
            />
          </label>
        ) : null}

        <div className="expand-modal-list">
          {loading ? (
            <div className="expand-modal-loading">
              <Loader2 size={16} className="spin" />
              <span>Loading repository…</span>
            </div>
          ) : error ? (
            <p className="expand-modal-error">{error}</p>
          ) : sources.length === 0 ? (
            <p className="expand-modal-empty">No repository items found. Add experiences in the Repository tab first.</p>
          ) : visible.length === 0 ? (
            <p className="expand-modal-empty">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          ) : (
            visible.map((source) => {
              const key = `${source.kind}-${source.id}`;
              const isSelected = selected ? `${selected.kind}-${selected.id}` === key : false;
              const dateStr = [
                source.start_date,
                source.end_date ?? 'Present',
              ]
                .filter(Boolean)
                .join(' – ');
              const preview = source.freewrite.trim().slice(0, 130);
              const truncated = source.freewrite.trim().length > 130;

              return (
                <button
                  key={key}
                  type="button"
                  className={`expand-modal-item${isSelected ? ' expand-modal-item--selected' : ''}`}
                  onClick={() => setSelected(isSelected ? null : source)}
                >
                  <div className="expand-modal-item-top">
                    {source.type === 'experience' ? (
                      <Briefcase size={11} className="expand-modal-item-icon" />
                    ) : (
                      <FolderGit2 size={11} className="expand-modal-item-icon" />
                    )}
                    <span className="expand-modal-item-title">{source.title}</span>
                    {source.company ? (
                      <span className="expand-modal-item-org">{source.company}</span>
                    ) : null}
                    {dateStr ? (
                      <span className="expand-modal-item-date">{dateStr}</span>
                    ) : null}
                  </div>
                  {preview ? (
                    <p className="expand-modal-item-preview">
                      {preview}{truncated ? '…' : ''}
                    </p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="expand-modal-footer">
          <button type="button" className="expand-modal-btn expand-modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="expand-modal-btn expand-modal-btn--add"
            disabled={!selected}
            onClick={() => { if (selected) onSelect(selected); }}
          >
            Add to resume
          </button>
        </div>
      </div>
    </div>
  );
}
