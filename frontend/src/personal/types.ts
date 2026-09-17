import type { ResumeData } from '../types/resume';

/**
 * Everything about the candidate that must never be committed: contact
 * details, the starter resume, and the prompt examples drawn from the
 * candidate's own experiences. The real values live in the gitignored
 * `personal.local.ts`; `personal.example.ts` is the committed stand-in.
 */
export interface PersonalProfile {
  contact: {
    name: string;
    email: string;
    phone: string;
    /** Display form, no scheme: "linkedin.com/in/handle". */
    linkedin: string;
    /** Display form, no scheme: "github.com/handle". */
    github: string;
    /** "City, ST" */
    location: string;
  };
  /** The resume the editor opens with before anything is built. */
  defaultResume: ResumeData;
  /** Example phrases quoted inside the prompt templates. */
  promptExamples: {
    /** An experience selected into an accelerator: title plus its titleNote. */
    accelerator: { title: string; programName: string; titleNote: string };
    /** First-bullet descriptions of a discipline in plain words. */
    plainDiscipline: [string, string];
    /** The same kind of work named precisely, for later bullets. */
    technicalMechanics: string;
    /** A plain-words "how it works" clause for a first bullet. */
    plainHow: string;
    /** The kind of thing a proper name hides: "a Chrome extension that...". */
    kindOfThing: [string, string];
    /** Internal/proper names that tell an outsider nothing. */
    internalNames: [string, string, string];
    /** An impressive before/after pair. */
    beforeAfter: string;
    /** Two impressive scale figures. */
    scale: [string, string];
    /** A thing named the way the source names it: "an inventory system". */
    sourceTermName: string;
    /** Ownership phrasing as sources state it. */
    ownership: [string, string, string, string];
    /** Education detail line: GPA plus honors. */
    educationHonors: string;
    /** Education involvement line: TA roles, teams, clubs. */
    educationInvolvement: string;
    /** A cover-letter sentence that front-loads a description of the candidate. */
    coverLetterFrontLoad: string;
    /** The same pattern, longer, as quoted in the cover-letter rules. */
    coverLetterFrontLoadLong: string;
  };
}
