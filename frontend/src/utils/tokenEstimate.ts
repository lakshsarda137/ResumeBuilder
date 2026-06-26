/**
 * Rough input-token estimate for English-ish text (~4 chars per token).
 * Actual provider tokenizers differ; this is intentionally conservative for UX.
 */
export function estimateInputTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.ceil(trimmed.length / 4);
}

export function formatTokenEstimate(count: number): string {
  return `~${count.toLocaleString()} input tokens (estimate)`;
}

export function formatCompactTokenEstimate(count: number): string {
  if (count >= 1000) {
    const rounded =
      count >= 10000 ? Math.round(count / 1000).toString() : (count / 1000).toFixed(1);
    return `~${rounded}k`;
  }

  return `~${Math.max(0, Math.round(count)).toLocaleString()}`;
}
