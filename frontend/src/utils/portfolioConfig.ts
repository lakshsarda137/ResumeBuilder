import { PERSONAL } from '../personal';

/**
 * Tell the server where the portfolio write-ups live.
 *
 * The path and site URL sit in the gitignored personal profile, which is
 * frontend-only, so the server cannot read them on its own. Pushing them once
 * per app load is what lets the server's ten-minute timer keep the repository
 * in sync with no page open. Stored server-side, so it also survives a restart
 * of the app; a failure here is not worth interrupting anyone over, because the
 * Repository page's sync button reports it properly when pressed.
 */
export async function pushPortfolioConfig(): Promise<void> {
  const { contentDir, baseUrl } = PERSONAL.portfolio;
  if (!contentDir.trim()) {
    return;
  }

  try {
    await fetch('/api/portfolio/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentDir, baseUrl, autoSync: true }),
    });
  } catch {
    // Server not running yet; the next app load tries again.
  }
}
