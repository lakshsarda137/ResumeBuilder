import { useCallback, useState } from 'react';
import { FolderSync, Loader2 } from 'lucide-react';
import { PERSONAL } from '../personal';
import { pushPortfolioConfig } from '../utils/portfolioConfig';

interface PortfolioSyncButtonProps {
  /** Reload the repository list once the sync has written its changes. */
  onComplete: () => void;
}

interface SyncResult {
  created?: string[];
  updated?: string[];
  skipped?: string;
  error?: string;
}

/**
 * Sync the repository from the portfolio site's markdown write-ups.
 *
 * The parsing and writing live in the backend (`backend/portfolioSync.cjs`), so
 * the same code serves this button and the ten-minute timer that keeps the
 * warehouse current while the server runs. This component only tells the server
 * where the portfolio is (from the gitignored personal profile, which the
 * server itself cannot see) and asks it to sync now.
 *
 * Hidden when no portfolio folder is configured, which is the case for anyone
 * running this from a fresh clone.
 */
export function PortfolioSyncButton({ onComplete }: PortfolioSyncButtonProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const { contentDir } = PERSONAL.portfolio;
  const configured = contentDir.trim().length > 0;

  const sync = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    setStatus(null);

    try {
      // App load already did this; repeat it in case the server restarted since.
      await pushPortfolioConfig();
      const res = await fetch('/api/portfolio/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const body = (await res.json().catch(() => ({}))) as SyncResult;
      if (!res.ok) {
        throw new Error(body.error ?? 'Could not sync from the portfolio folder.');
      }

      setStatus(
        body.skipped
          ? `Nothing to do: ${body.skipped}.`
          : `${body.created?.length ?? 0} added, ${body.updated?.length ?? 0} updated from the portfolio.`,
      );
      onComplete();
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [onComplete]);

  if (!configured) {
    return null;
  }

  return (
    <div className="portfolio-sync">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={sync}
        disabled={busy}
        title={`Read the write-ups in ${contentDir} and update this repository from them. This also runs automatically every 10 minutes while the server is on.`}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <FolderSync size={15} />}
        {busy ? 'Syncing…' : 'Sync from portfolio'}
      </button>
      {status && (
        <span className={`portfolio-sync-status${failed ? ' portfolio-sync-status--error' : ''}`}>
          {status}
        </span>
      )}
    </div>
  );
}
