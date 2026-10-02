import type { EducationData } from '../types/education';
import type { RepositorySource } from '../types/repository';
import type { ResumeData } from '../types/resume';
import {
  mapRepositorySourcesForPrompt,
  buildResumeEducationContext,
} from './aiPrompt';
import { EM_DASH_PROMPT_RULE } from './emDash';
import { describeContactProfile, formatLetterDate } from './contactProfile';
import {
  COVER_LETTER_JD_COMMENT_RULES,
  COVER_LETTER_WRITING_CONTRACT,
} from './coverLetterWritingRules';
import { PERSONAL } from '../personal';

export const COVER_LETTER_JSON_SCHEMA = `{
  "contact": {
    "name": "string",
    "links": [{ "id": "string", "value": "string", "label": "optional string — anchor text shown instead of the URL (\\"LinkedIn\\", \\"GitHub\\")" }]
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
1. Write exactly ---JSON-START--- on its own line, then the JSON object inside a \`\`\`json fenced code block, then ---JSON-END--- on its own line. The fence matters: outside one, your chat renderer eats the backslash before every \\" in the letter text, and the object stops parsing at the first quoted phrase.
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

WRITE A DRAFT, THEN REVISE IT FOR READABILITY BEFORE YOU CHECK ANYTHING ELSE.
The first draft of a letter written under the constraints above will be dense and choppy: correct sentence by sentence, exhausting to read in sequence. Fixing that is a separate pass, and it is the one that decides whether this letter is any good. Do it first, because the compliance checks below are cheap and this one is not.
- Read the draft straight through as a person would. Mark every place you stumbled, re-read a sentence, or lost track of who or what was being discussed. Rewrite each one.
- Now read it again at skimming speed, the way a recruiter with thirty seconds will. Any sentence that did not land on that pass gets rewritten until it does: subject and verb up front, one clause, ordinary words.
- For each paragraph, name its ONE point in your head. Any sentence not developing that point moves to another paragraph or gets cut.
- Find every sentence with no connection to the sentence before it — especially bare standalone facts like "I'm applying for the X position." Merge it, connect it, or cut it.
- Find every sentence over about 35 words and split it. Find every pair of consecutive long complex sentences and shorten one.
- Find every sentence that front-loads a description before naming its subject ("${PERSONAL.promptExamples.coverLetterFrontLoad}") and rewrite it so the subject comes first.
- If the letter is now too long, CUT A WHOLE POINT. Do not recompress the surviving sentences — that is what produced the unreadable draft.

THEN CHECK COMPLIANCE:
- Read every sentence against the resume. Delete any that merely restates it.
- Count the sentences that begin with "I". Aim for under half, and never three in a row — but leave any "I" opening whose only alternative is a contorted sentence.
- Search your draft for every banned word listed above and remove each one you find, including "keep coming back to", "come back to", "lived", and "broke" in any form.
- Search your draft for the name of every company, startup, and project on the resume. Replace each with a plain description ("at my previous internship", "at my startup"). Only the employer this letter is addressed to keeps its name.
- Search your draft for every sentence that refers to the posting, the job description, or what the employer is "looking for", and every sentence shaped like "you want X, and I have done X". Rewrite each so the fit comes through the work itself.
- Find every sentence that opens with a wind-up before its subject — a date, a condition, a subordinate clause — and turn it around so the subject comes first.
- Search for every sentence that says what something is NOT before saying what it is ("not X, but Y", "isn't just", "rather than", "less about X than Y"), including the version split across two sentences. Rewrite each as the positive claim alone.
- Confirm the opening names the employer and the exact role title, the closing answers why this employer, and the last sentence of the letter is the thank-you.
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

/**
 * Cover letter from an UPLOADED resume PDF plus a job description, with no
 * build step in between. The PDF is attached to the send (or, for Gemini,
 * extracted to text locally, exactly as the optimize path does). The model
 * reads that resume and writes the letter against it.
 *
 * Output is the cover letter object alone. It used to carry a second
 * top-level "resume" key holding a faithful extraction of the attached PDF,
 * which the app never needed: the editor keeps the resume it already has. That
 * extraction roughly tripled the response, and a response that long is what
 * pushes a provider into truncating before the closing ---JSON-END---. When
 * that happened the only complete letter-shaped JSON left on the page was the
 * schema in the prompt itself, which surfaced as "Captured JSON was a
 * cover-letter-shaped schema or placeholder". The letter is the deliverable,
 * so it is now the whole response.
 */
export function buildCoverLetterFromPdfPrompt({
  jobDescription,
  sources,
  educationData,
  settingsInstructions,
  today = new Date(),
}: {
  jobDescription: string;
  /** Optional freewrite warehouse, so the letter has material beyond the page. */
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
      ? `\nCANDIDATE SOURCE MATERIAL (freewrite notes about the same work the resume summarizes — raw truth, with far more detail than fit on the page; use it for the reasoning, constraints, and decisions the resume had no room for):\n\`\`\`json\n${JSON.stringify(
          mapRepositorySourcesForPrompt(sources),
          null,
          2,
        )}\n\`\`\`\n`
      : '';

  return `You are writing a cover letter that will be sent to an employer together with the ATTACHED resume PDF. Write it as the candidate, in their voice. The attached PDF is the final resume, exactly as the employer will receive it.

TODAY'S DATE: ${formatLetterDate(today)}
Use exactly this date in the "date" field. Do not compute, guess, or shift it.

JOB DESCRIPTION:
"""
${jd}
"""
${settingsBlock}${sourceBlock}${buildResumeEducationContext(educationData)}

CANDIDATE CONTACT FACTS (the letter header must carry exactly these, in this form, matching the resume header):
${describeContactProfile()}

Do this:
1. Read the attached resume PDF carefully. It is the resume this letter accompanies, so every employer, title, date, and metric in the letter must match it exactly, and the letter must not restate it.
2. Write the cover letter. Output ONLY the letter — do not transcribe, rewrite, or return the resume in any form.

${COVER_LETTER_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

${COVER_LETTER_JD_COMMENT_RULES}

WRITE A DRAFT, THEN REVISE IT FOR READABILITY BEFORE YOU CHECK ANYTHING ELSE.
- Read the draft straight through as a person would. Mark every place you stumbled, re-read a sentence, or lost track of who or what was being discussed. Rewrite each one.
- Now read it again at skimming speed, the way a recruiter with thirty seconds will. Any sentence that did not land on that pass gets rewritten until it does: subject and verb up front, one clause, ordinary words.
- For each paragraph, name its ONE point in your head. Any sentence not developing that point moves to another paragraph or gets cut.
- Find every sentence with no connection to the sentence before it and merge it, connect it, or cut it.
- Find every sentence over about 35 words and split it.
- If the letter is too long, CUT A WHOLE POINT rather than compressing every sentence.

THEN CHECK COMPLIANCE:
- Read every sentence against the resume. Delete any that merely restates it.
- Count the sentences that begin with "I". Aim for under half, and never three in a row.
- Search your draft for every banned word listed above and remove each one you find, including "keep coming back to", "come back to", "lived", and "broke" in any form.
- Search your draft for the name of every company, startup, and project on the resume. Replace each with a plain description ("at my previous internship", "at my startup"). Only the employer this letter is addressed to keeps its name.
- Search your draft for every sentence that refers to the posting, the job description, or what the employer is "looking for", and every sentence shaped like "you want X, and I have done X". Rewrite each so the fit comes through the work itself.
- Find every sentence that opens with a wind-up before its subject — a date, a condition, a subordinate clause — and turn it around so the subject comes first.
- Search for every sentence that says what something is NOT before saying what it is ("not X, but Y", "isn't just", "rather than", "less about X than Y"), including the version split across two sentences. Rewrite each as the positive claim alone.
- Confirm the opening names the employer and the exact role title, the closing answers why this employer, and the last sentence of the letter is the thank-you.
- Confirm there is no em dash anywhere, that no sentence claims a feeling, and that the specific detail you gave about the organization actually appears in the job description.

CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Write exactly ---JSON-START--- on its own line, then the JSON object inside a \`\`\`json fenced code block, then ---JSON-END--- on its own line. The fence matters: outside one, your chat renderer eats the backslash before every \\" in the letter text, and the object stops parsing at the first quoted phrase.
2. The JSON object is the cover letter, and nothing else. It has exactly these top-level keys:
${COVER_LETTER_JSON_SCHEMA}
3. Do NOT include a "resume" key, the resume's sections, or any other transcription of the attached PDF. The app already has the resume; returning it wastes the response and risks it being cut off before the closing delimiter.
4. There is no "recipient" key. Do not add one, and do not add a subject or "RE:" line.
5. Generate stable unique string ids for every paragraph.
6. Do not output the schema or its example placeholders as content. Never include meta-instructions, placeholders, todo text, editor notes, or bracketed blanks like "[Company Name]" in any visible field.
7. No text outside the ---JSON-START--- / ---JSON-END--- delimiters.`;
}
