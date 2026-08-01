import type { EducationData } from '../types/education';
import type { RepositorySource } from '../types/repository';
import type { ResumeData } from '../types/resume';
import { mapRepositorySourcesForPrompt, buildResumeEducationContext } from './aiPrompt';
import { EM_DASH_PROMPT_RULE } from './emDash';
import { describeContactProfile, formatLetterDate } from './contactProfile';
import {
  COVER_LETTER_JD_COMMENT_RULES,
  COVER_LETTER_WRITING_CONTRACT,
} from './coverLetterWritingRules';

export const COVER_LETTER_JSON_SCHEMA = `{
  "contact": {
    "name": "string",
    "links": [{ "id": "string", "value": "string" }]
  },
  "date": "string — the letter date, exactly the date supplied to you above, written as \\"Month D, YYYY\\"",
  "greeting": "string — exactly \\"Dear Hiring Team,\\"",
  "paragraphs": [
    {
      "id": "string",
      "text": "string — one paragraph of connected prose. No bullet lists, no headings, no markdown, no HTML.",
      "jdComment": "optional — honest note on how this paragraph matches the job description; omit the field entirely when there is no genuine match"
    }
  ],
  "closing": "string — e.g. \\"Sincerely,\\"",
  "signatureName": "string — the candidate's full name"
}`;

const COVER_LETTER_OUTPUT_RULES = `CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Write exactly ---JSON-START--- on its own line, then the raw JSON object, then ---JSON-END--- on its own line.
2. The JSON must match this schema:
${COVER_LETTER_JSON_SCHEMA}
3. There is no "recipient" key. Do not add one, and do not add a subject or "RE:" line.
4. Generate stable unique string ids for every paragraph.
5. Do not output the schema or its example placeholders as content. The letter must be built from the real resume, the real source material, and the actual job description.
6. Never include meta-instructions, placeholders, todo text, editor notes, or bracketed blanks like "[Company Name]" in any visible field.
7. No text outside the ---JSON-START--- / ---JSON-END--- delimiters.`;

/**
 * The one generation prompt. The cover letter is always written by a single
 * model (no council), always after the final resume exists, and always with
 * both the resume and the repository freewrites in hand — the resume so the
 * letter does not repeat it, the freewrites so it has something else to say.
 */
export function buildCoverLetterPrompt({
  jobDescription,
  resume,
  sources,
  educationData,
  settingsInstructions,
  today = new Date(),
}: {
  jobDescription: string;
  /** The final resume, exactly as it will be sent to this employer. */
  resume: ResumeData;
  /** The same freewrite sources the resume was built from — richer than what fit on the page. */
  sources: RepositorySource[];
  educationData?: EducationData;
  settingsInstructions?: string;
  today?: Date;
}): string {
  const jd =
    jobDescription.trim() ||
    '(No job description provided — write a strong general cover letter and keep every claim to what the source material supports.)';

  const settingsBlock = settingsInstructions?.trim()
    ? `\nRENDER / CONTENT SETTINGS the letter must honor:\n${settingsInstructions.trim()}\n`
    : '';

  const sourceBlock =
    sources.length > 0
      ? `\nCANDIDATE SOURCE MATERIAL (the freewrite warehouse the resume was built from — raw truth, far more detail than fit on the page):\n\`\`\`json\n${JSON.stringify(
          mapRepositorySourcesForPrompt(sources),
          null,
          2,
        )}\n\`\`\`\n`
      : '';

  return `You are writing a cover letter that will be sent to an employer together with the resume below. Write it as the candidate, in their voice.

TODAY'S DATE: ${formatLetterDate(today)}
Use exactly this date in the "date" field. Do not compute, guess, or shift it.

JOB DESCRIPTION:
"""
${jd}
"""
${settingsBlock}
THE FINAL RESUME THIS LETTER ACCOMPANIES (already tailored to the job above — the employer will read both documents together):
\`\`\`json
${JSON.stringify(resume, null, 2)}
\`\`\`
${sourceBlock}${buildResumeEducationContext(educationData)}

CANDIDATE CONTACT FACTS (the letter header must carry exactly these, in this form, matching the resume header):
${describeContactProfile()}

${COVER_LETTER_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

${COVER_LETTER_JD_COMMENT_RULES}

BEFORE YOU EMIT THE JSON, CHECK YOUR OWN DRAFT:
- Read every sentence against the resume. Delete any that merely restates it.
- Count the sentences that begin with "I". If it is more than about half, or if any two consecutive sentences do, rewrite them.
- Search your draft for every banned word listed above and remove each one you find.
- Confirm there is no em dash anywhere, that no sentence claims a feeling, and that the specific detail you gave about the organization actually appears in the job description.

${COVER_LETTER_OUTPUT_RULES}`;
}

/**
 * Cover note paired with the letter task when it is delivered as a .txt
 * attachment instead of pasted. Gemini's composer silently truncates large
 * prompts and the output contract lives at the tail, so a truncated send loses
 * the JSON delimiters entirely — see `promptDelivery.ts`.
 */
export function buildCoverLetterCoverPrompt(filename: string): string {
  return `The attached file "${filename}" contains your COMPLETE task as a cover letter writer. Read the ENTIRE file and follow every instruction in it exactly — including the job description, the final resume, the candidate source material, the writing contract, and the output-format contract at the end.

Reply with ONLY the output the file specifies: one JSON cover letter object wrapped exactly between a line reading ---JSON-START--- and a line reading ---JSON-END---. Do not write any analysis, headings, prose, or markdown outside those two delimiter lines.`;
}
