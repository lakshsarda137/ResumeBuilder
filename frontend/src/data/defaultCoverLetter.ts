import type { CoverLetterData } from '../types/coverLetter';
import { CONTACT_PROFILE, CONTACT_PROFILE_NAME } from '../utils/contactProfile';

/**
 * The empty-state letter. Its header comes from the shared contact profile so
 * it always matches the resume header. The body is a single placeholder line
 * rather than a fake letter: a real one is always generated, and the previous
 * template opened with "I am writing to express my interest in this role",
 * which is now a banned opening in the writing contract.
 */
export const defaultCoverLetter: CoverLetterData = {
  contact: {
    name: CONTACT_PROFILE_NAME,
    links: CONTACT_PROFILE.map((entry) => ({ id: entry.id, value: entry.value })),
  },
  date: '',
  greeting: 'Dear Hiring Team,',
  paragraphs: [
    {
      id: 'para-1',
      text: 'Generate a cover letter from the resume builder to fill this in.',
    },
  ],
  closing: 'Sincerely,',
  signatureName: CONTACT_PROFILE_NAME,
};
