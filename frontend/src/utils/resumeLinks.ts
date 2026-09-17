import type { EntryLink } from '../types/resume';

/**
 * Hyperlink derivation for the rendered resume.
 *
 * Two places on the page become real anchors: contact-header values (email,
 * personal site, GitHub, LinkedIn) and entry-title links (`entry.links`, e.g.
 * "GitHub" and "Play Online" for a project). Anchors in the DOM are
 * what make links survive both PDF export paths — Chrome's printToPDF turns
 * `<a href>` into clickable link annotations on its own, and the fallback
 * text-PDF builder reads anchor rects to write its own annotations.
 */

function stripInlineHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim();
}

/**
 * Normalize a URL for use as an anchor href. Accepts http(s) URLs and bare
 * domains ("github.com/user/repo" → "https://github.com/user/repo"). Returns
 * null for anything else — notably any other scheme (javascript:, data:), so a
 * malformed or malicious LLM value can never become an executable href.
 */
export function normalizeUrl(value: string | null | undefined): string | null {
  const text = stripInlineHtml(value ?? '');
  if (!text || /\s/.test(text) || /["'<>]/.test(text)) {
    return null;
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(text)) {
    return `https://${text}`;
  }

  return null;
}

/**
 * Derive an href for a contact-header value: emails become mailto links, URLs
 * and bare domains become https links, and everything else (phone numbers,
 * "City, ST") returns null and renders as plain text.
 */
export function contactHrefFor(value: string | null | undefined): string | null {
  const text = stripInlineHtml(value ?? '');
  if (!text) {
    return null;
  }

  if (/^[^\s@|]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(text)) {
    return `mailto:${text}`;
  }

  return normalizeUrl(text);
}

/**
 * Loose contact-header matching: values like "LinkedIn: linkedin.com/in/me"
 * or "GitHub · github.com/me" still get an href by pulling the first
 * URL-shaped token out of the text.
 */
export function contactHrefLoose(value: string | null | undefined): string | null {
  const direct = contactHrefFor(value);
  if (direct) {
    return direct;
  }
  const text = stripInlineHtml(value ?? '');
  for (const token of text.split(/[\s|·,;]+/)) {
    const cleaned = token.replace(/^[([]+|[)\].]+$/g, '');
    const href = contactHrefFor(cleaned);
    if (href && (cleaned.includes('/') || cleaned.includes('@') || /^https?:/i.test(cleaned))) {
      return href;
    }
  }
  return null;
}

export const DEFAULT_GITHUB_LABEL = 'GitHub';
export const DEFAULT_WEBSITE_LABEL = 'Website';

/** Guess an anchor label for a bare URL (used when migrating legacy `url`). */
export function defaultLabelForUrl(url: string): string {
  return /github\.com/i.test(url) ? DEFAULT_GITHUB_LABEL : DEFAULT_WEBSITE_LABEL;
}

/**
 * Normalize an arbitrary list of {label, url} into safe EntryLinks: drops
 * anything without an https-normalizable url, trims labels, fills a default
 * label, and dedupes by href.
 */
export function normalizeEntryLinks(raw: unknown): EntryLink[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const out: EntryLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { label, url } = item as { label?: unknown; url?: unknown };
    const href = typeof url === 'string' ? normalizeUrl(url) : null;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const text = typeof label === 'string' ? stripInlineHtml(label) : '';
    out.push({ label: text || defaultLabelForUrl(href), url: href });
  }
  return out;
}

/** Build EntryLinks from a repository item's optional github/website fields. */
export function repoItemLinks(item: {
  github_url?: string | null;
  github_label?: string | null;
  website_url?: string | null;
  website_label?: string | null;
}): EntryLink[] {
  return normalizeEntryLinks([
    { label: item.github_label?.trim() || DEFAULT_GITHUB_LABEL, url: item.github_url ?? '' },
    { label: item.website_label?.trim() || DEFAULT_WEBSITE_LABEL, url: item.website_url ?? '' },
  ]);
}
