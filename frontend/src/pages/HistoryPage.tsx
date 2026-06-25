import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ExternalLink,
  History,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { HistorySessionListItem } from '../types/historySession';
import {
  deleteHistorySession,
  fetchHistorySessions,
  formatUtcDateTime,
} from '../utils/historySessions';
import { ClearAllButton } from '../components/ClearAllButton';
import '../components/Layout.css';
import './HistoryPage.css';

export function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<HistorySessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchHistorySessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = (id: string) => {
    navigate(`/resume?session=${encodeURIComponent(id)}`);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}" from history? This cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteHistorySession(id);
      setSessions((prev) => prev.filter((session) => session.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete session');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page history-page">
      <div className="page-header history-page-header">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">
            Saved resume builds with job descriptions, JD match notes, and editor state.
          </p>
        </div>
        {!loading && !error && sessions.length > 0 ? (
          <ClearAllButton
            apiPath="/api/history"
            confirmMessage="Delete ALL saved history sessions? This cannot be undone."
            onComplete={load}
          />
        ) : null}
      </div>

      {loading ? (
        <p className="history-loading">
          <Loader2 size={16} className="spin" />
          Loading sessions…
        </p>
      ) : error ? (
        <p className="history-error">{error}</p>
      ) : sessions.length === 0 ? (
        <div className="empty-state">
          <div className="history-empty-block">
            <History size={28} className="history-empty-icon" />
            <div>
              <p>No saved sessions yet.</p>
              <p className="history-empty-hint">
                Open the Resume Builder, edit your resume, then click <strong>Save</strong>{' '}
                in the toolbar to store a session here.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ul className="history-list">
          {sessions.map((session) => (
            <li key={session.id} className="history-card card">
              <div className="history-card-main">
                <h2 className="history-card-title">{session.title}</h2>
                <div className="history-card-meta">
                  <span className="history-card-meta-item">
                    <Clock size={13} />
                    Last updated {formatUtcDateTime(session.updated_at)}
                  </span>
                  <span className="history-card-meta-item history-card-meta-item--muted">
                    Created {formatUtcDateTime(session.created_at)}
                  </span>
                </div>
              </div>
              <div className="history-card-actions">
                <button
                  type="button"
                  className="btn btn--primary history-open-btn"
                  onClick={() => handleOpen(session.id)}
                >
                  <ExternalLink size={14} />
                  Open
                </button>
                <button
                  type="button"
                  className="btn btn--ghost history-delete-btn"
                  onClick={() => handleDelete(session.id, session.title)}
                  disabled={deletingId === session.id}
                  title="Delete session"
                >
                  {deletingId === session.id ? (
                    <Loader2 size={14} className="spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
