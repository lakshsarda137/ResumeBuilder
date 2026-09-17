/**
 * The candidate's canonical contact facts, owned in one place.
 *
 * The cover letter guide's first checklist item is "Consistent with your
 * resume, e.g., header, font?" — so the letter header and the resume header
 * cannot be allowed to drift. Both read from here: the generation prompts are
 * told these are the contact facts, and `ensureContactProfile` guarantees it
 * afterwards regardless of what the model returned.
 *
 * Profile URLs never appear on the page: LinkedIn and GitHub carry a `label`,
 * and the header shows that word ("LinkedIn", "GitHub") hyperlinked to the
 * URL in `value`.
 *
 * The values come from the personal profile (src/personal): the real ones
 * live in the gitignored personal.local.ts. Edit them there; both documents
 * pick them up on the next build.
 */
import type { ContactInfo, ContactLink } from '../types/resume';
import { PERSONAL } from '../personal';

export const CONTACT_PROFILE_NAME = PERSONAL.contact.name;

/**
 * One canonical contact fact. `matches` identifies the same fact already
 * present in a header under a different spelling, so a resume that already
 * says "linkedin.com/in/<handle>" is left alone rather than gaining a
 * duplicate LinkedIn entry.
 */
export interface ContactProfileEntry {
  id: string;
  value: string;
  /** Anchor text shown instead of the URL. */
  label?: string;
  matches: (existing: string) => boolean;
}

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export const CONTACT_PROFILE: ContactProfileEntry[] = [
  {
    id: 'contact-email',
    value: PERSONAL.contact.email,
    matches: (existing) => existing.includes('@'),
  },
  {
    id: 'contact-phone',
    value: PERSONAL.contact.phone,
    // A phone is the only header fact that is mostly digits; 7+ of them in a
    // value that is not an email or URL is unambiguous.
    matches: (existing) =>
      !existing.includes('@') && !/[a-z]{3,}\.[a-z]{2,}/i.test(existing) && digitCount(existing) >= 7,
  },
  {
    id: 'contact-linkedin',
    value: PERSONAL.contact.linkedin,
    label: 'LinkedIn',
    matches: (existing) => /linkedin\./i.test(existing),
  },
  {
    id: 'contact-github',
    value: PERSONAL.contact.github,
    label: 'GitHub',
    matches: (existing) => /github\./i.test(existing),
  },
];

/**
 * Format a raw phone number the way a US resume header displays one.
 * "+1 5555550100" and "5555550100" both become "(555) 555-0100". The country
 * code is dropped: it is noise on a resume aimed at the US market, and the
 * user's existing resume already omits it.
 */
export function formatUsPhone(raw: string): string {
  const digits = (raw.match(/\d/g) ?? []).join('');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) {
    return raw.trim();
  }
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Append any canonical contact fact the header is missing, preserving whatever
 * is already there (including extras like a "City, ST" location, and including values
 * the user has hand-edited). Never reorders and never overwrites a value; the
 * only other change is giving a profile link its canonical label when it has
 * none, so a header never shows a bare LinkedIn/GitHub URL.
 */
export function ensureContactProfile(contact: ContactInfo): ContactInfo {
  const links: ContactLink[] = contact.links
    .filter((link) => link.value.trim().length > 0)
    .map((link) => {
      if (link.label?.trim()) {
        return link;
      }
      const label = CONTACT_PROFILE.find((entry) => entry.label && entry.matches(link.value))?.label;
      return label ? { ...link, label } : link;
    });

  const missing = CONTACT_PROFILE.filter(
    (entry) => !links.some((link) => entry.matches(link.value)),
  ).map((entry) => ({
    id: entry.id,
    value: entry.value,
    ...(entry.label ? { label: entry.label } : {}),
  }));

  return {
    name: contact.name.trim() || CONTACT_PROFILE_NAME,
    links: [...links, ...missing],
  };
}

/** The canonical header as prompt-ready text, so the model writes it correctly the first time. */
export function describeContactProfile(): string {
  return [
    `Name: ${CONTACT_PROFILE_NAME}`,
    ...CONTACT_PROFILE.map((entry) =>
      entry.label
        ? `- ${entry.value} (shown as the hyperlinked word "${entry.label}": set "label": "${entry.label}")`
        : `- ${entry.value}`,
    ),
  ].join('\n');
}

/** "August 1, 2026" — the letter-date convention in the guide's sample. */
export function formatLetterDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
