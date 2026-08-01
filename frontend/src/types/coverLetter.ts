import type { ContactInfo } from './resume';

export interface CoverLetterParagraph {
  id: string;
  text: string;
  /** Honest note on how this paragraph matches the job description. Mirrors ResumeBullet.jdComment — same opt-in contract, same "omit when there is no genuine match" rule. */
  jdComment?: string;
}

/**
 * The letter as it renders. Deliberately has no recipient block: the guide's
 * sample format opens with contact-person/company/address and an "RE:" line,
 * and all of that is skipped here — the app never knows the hiring manager's
 * name, and inventing one is worse than omitting it. The greeting carries the
 * whole address function.
 */
export interface CoverLetterData {
  contact: ContactInfo;
  /** Letter date line, e.g. "March 4, 2026". Em dashes are allowed here. */
  date: string;
  /** Always "Dear Hiring Team," unless the user edits it. */
  greeting: string;
  paragraphs: CoverLetterParagraph[];
  /** e.g. "Sincerely," */
  closing: string;
  signatureName: string;
}

export function makeCoverLetterParagraph(
  id: string,
  text: string,
  jdComment?: string,
): CoverLetterParagraph {
  return jdComment ? { id, text, jdComment } : { id, text };
}
