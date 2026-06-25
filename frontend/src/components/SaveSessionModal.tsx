import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import './SaveSessionModal.css';

interface SaveSessionModalProps {
  open: boolean;
  saving?: boolean;
  error?: string | null;
  onSave: (title: string) => void;
  onClose: () => void;
}

export function SaveSessionModal({
  open,
  saving = false,
  error = null,
  onSave,
  onClose,
}: SaveSessionModalProps) {
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) {
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="save-session-overlay" onClick={onClose} role="presentation">
      <div
        className="save-session-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="save-session-title"
        aria-modal="true"
      >
        <div className="save-session-header">
          <h2 id="save-session-title">Name this session</h2>
          <button
            type="button"
            className="save-session-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <p className="save-session-copy">
          Give this resume build a title so you can find it later in History. We save
          your resume, job description, JD match notes, zoom, and linked AI session.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="save-session-field">
            <span>Session title</span>
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Google SWE — March 2026"
              maxLength={120}
              disabled={saving}
            />
          </label>
          {error ? <p className="save-session-error">{error}</p> : null}
          <div className="save-session-actions">
            <button
              type="button"
              className="save-session-btn save-session-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="save-session-btn save-session-btn--primary"
              disabled={!title.trim() || saving}
            >
              {saving ? <Loader2 size={14} className="spin" /> : null}
              {saving ? 'Saving…' : 'Save session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
