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
