/**
 * Shared em-dash content rule for resume and cover letter generation.
 * Em dashes read as an AI writing tic in ordinary prose; they are only
 * tolerated inside a date range field (e.g. entry.date / cover letter date),
 * which this module deliberately does not touch.
 */
export const EM_DASH_PROMPT_RULE = `EM DASH RULE: Never use an em dash (—) in bullets, descriptions, paragraphs, titles, or any other prose content. Use a period, comma, colon, or separate sentence instead. A date range field takes an en dash: "Jan 2023 – Mar 2024". An em dash is tolerated in a date range and nowhere else, but the en dash is always the correct choice.`;

const EM_DASH = '—';

/** Replace stray em dashes with a plain hyphen. Never call this on date fields. */
export function sanitizeEmDashes(value: string): string {
  if (!value.includes(EM_DASH)) {
    return value;
  }
  return value.split(EM_DASH).join(' - ').replace(/\s{2,}/g, ' ').trim();
}
