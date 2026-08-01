/**
 * The candidate's canonical contact facts, owned in one place.
 *
 * The cover letter guide's first checklist item is "Consistent with your
 * resume, e.g., header, font?" — so the letter header and the resume header
 * cannot be allowed to drift. Both read from here: the generation prompts are
 * told these are the contact facts, and `ensureContactProfile` guarantees it
 * afterwards regardless of what the model returned.
 *
 * URLs are stored in DISPLAY form (no scheme, no trailing slash). A header line
 * has to carry five facts on one line, and "https://www." is pure cost there.
 *
 * To change a value, edit it here — this is the single authority, and both
 * documents pick it up on the next build.
 */
import type { ContactInfo, ContactLink } from '../types/resume';

export const CONTACT_PROFILE_NAME = 'Laksh Sarda';

/**
 * One canonical contact fact. `matches` identifies the same fact already
 * present in a header under a different spelling, so a resume that already
 * says "linkedin.com/in/lakshsarda" is left alone rather than gaining a
 * duplicate LinkedIn entry.
 */
export interface ContactProfileEntry {
  id: string;
  value: string;
  matches: (existing: string) => boolean;
}

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export const CONTACT_PROFILE: ContactProfileEntry[] = [
  {
    id: 'contact-email',
    value: 'lakshsarda137@gmail.com',
    matches: (existing) => existing.includes('@'),
  },
  {
    id: 'contact-phone',
    value: '(979) 327-8075',
    // A phone is the only header fact that is mostly digits; 7+ of them in a
    // value that is not an email or URL is unambiguous.
    matches: (existing) =>
      !existing.includes('@') && !/[a-z]{3,}\.[a-z]{2,}/i.test(existing) && digitCount(existing) >= 7,
  },
  {
    id: 'contact-linkedin',
    value: 'linkedin.com/in/lakshsarda',
    matches: (existing) => /linkedin\./i.test(existing),
  },
  {
    id: 'contact-github',
    value: 'github.com/lakshsarda137',
    matches: (existing) => /github\./i.test(existing),
  },
];

/**
 * Format a raw phone number the way a US resume header displays one.
 * "+1 9793278075" and "9793278075" both become "(979) 327-8075". The country
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
 * is already there (including extras like "Houston, TX", and including values
 * the user has hand-edited). Never reorders and never overwrites — the only
 * operation is "add what is absent".
 */
export function ensureContactProfile(contact: ContactInfo): ContactInfo {
  const links: ContactLink[] = contact.links.filter((link) => link.value.trim().length > 0);

  const missing = CONTACT_PROFILE.filter(
    (entry) => !links.some((link) => entry.matches(link.value)),
  ).map((entry) => ({ id: entry.id, value: entry.value }));

  return {
    name: contact.name.trim() || CONTACT_PROFILE_NAME,
    links: [...links, ...missing],
  };
}

/** The canonical header as prompt-ready text, so the model writes it correctly the first time. */
export function describeContactProfile(): string {
  return [
    `Name: ${CONTACT_PROFILE_NAME}`,
    ...CONTACT_PROFILE.map((entry) => `- ${entry.value}`),
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
