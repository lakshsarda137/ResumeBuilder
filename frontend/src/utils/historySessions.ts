import type {
  HistorySession,
  HistorySessionListItem,
  HistorySessionSnapshot,
} from '../types/historySession';

export async function fetchHistorySessions(): Promise<HistorySessionListItem[]> {
  const res = await fetch('/api/history');
  if (!res.ok) {
    throw new Error('Failed to load history sessions');
  }
  return res.json();
}

export async function fetchHistorySession(id: string): Promise<HistorySession> {
  const res = await fetch(`/api/history/${id}`);
  if (!res.ok) {
    throw new Error('Session not found');
  }
  return res.json();
}

export async function createHistorySession(
  title: string,
  snapshot: HistorySessionSnapshot,
): Promise<HistorySession> {
  const res = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, snapshot }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to save session');
  }
  return res.json();
}

export async function updateHistorySession(
  id: string,
  snapshot: HistorySessionSnapshot,
  title?: string,
): Promise<HistorySession> {
  const res = await fetch(`/api/history/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot, title }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to update session');
  }
  return res.json();
}

export async function deleteHistorySession(id: string): Promise<void> {
  const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error('Failed to delete session');
  }
}

/** Display an ISO UTC timestamp as a readable UTC string. */
export function formatUtcDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return (
    date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' UTC'
  );
}
