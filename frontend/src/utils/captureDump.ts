/**
 * Diagnostic escape hatch for capture failures.
 *
 * When a parse fails, the error alone cannot say whether the provider truncated
 * its reply, wrote something off-contract, or whether the extension relayed the
 * whole page instead of the answer. The captured text says all three, but it is
 * far too large for an error string or the pipeline log, so it goes to disk.
 *
 * Reuses `/api/tmpfile`, which already writes text to a temp dir and returns the
 * path. That directory self-deletes after ten minutes, which is the right
 * lifetime for something only read while chasing a live failure.
 */
export async function saveCaptureDump(
  text: string,
  filename: string,
): Promise<string | null> {
  try {
    const res = await fetch('/api/tmpfile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename }),
    });
    const body = (await res.json().catch(() => ({}))) as { path?: string };
    return body.path ?? null;
  } catch {
    // A failed dump must never replace the real error.
    return null;
  }
}
