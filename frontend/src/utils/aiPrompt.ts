import type { ResumeData } from '../types/resume';
import type { RepositorySource } from '../types/repository';

export const RESUME_JSON_SCHEMA = `{
  "contact": {
    "name": "string",
    "links": [{ "id": "string", "value": "string" }]
  },
  "sections": [
    {
      "id": "string",
      "type": "education | experience | projects | skills | custom",
      "title": "string",
      "jdComment": "optional — how this section matches the job description",
      "entries": [
        {
          "id": "string",
          "title": "string",
          "location": "string",
          "date": "string",
          "subtitle": "string",
          "jdComment": "optional — how this entry matches the job description",
          "bullets": [
            {
              "text": "string",
              "jdComment": "optional — honest note on how this bullet matches JD keywords/requirements; omit if no genuine match"
            }
          ]
        }
      ],
      "skills": [
        {
          "id": "string",
          "label": "string",
          "items": "string",
          "jdComment": "optional — only if skills genuinely match JD; never invent skills"
        }
      ]
    }
  ]
}`;

const JD_HONESTY_RULES = `JOB-DESCRIPTION MATCH COMMENTS (required where applicable):
- Add "jdComment" on bullets, entries, sections, and skill rows when there is a GENUINE match to the job description.
- Be honest: do NOT claim a match or add skills/keywords that are not supported by the source material (e.g. do not add C++ if there is no evidence).
- jdComment should cite specific JD requirements/keywords and explain the real connection.
- Omit jdComment when there is no honest match — leave the field out entirely.`;

const OUTPUT_RULES = `CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Return the COMPLETE resume in exactly ONE fenced code block: \`\`\`json ... \`\`\`
2. The JSON must match this schema:
${RESUME_JSON_SCHEMA}
3. For skills sections use the "skills" array and keep "entries" as [].
4. Do not include commentary outside the JSON block.
5. PRESERVE all existing section ids, entry ids, link ids, and skill ids from the input JSON — reuse them exactly even when reordering sections or entries. Only generate new ids for genuinely new items.
6. After the closing \`\`\` write exactly: ---END---`;

const DEFAULT_USER_PROMPT =
  'Improve one bullet point for clarity and tighten the wording. Keep all facts accurate.';

export function getDefaultAiUserPrompt() {
  return DEFAULT_USER_PROMPT;
}

export function buildImportPrompt(): string {
  return `Extract the full resume from the attached PDF into structured JSON for a resume editor.

${OUTPUT_RULES}
5. Preserve all section headings exactly as they appear in the PDF.
6. Choose section "type": use "skills" only for skills/technologies sections; use "education", "experience", or "projects" when the heading clearly matches; otherwise use "custom".
7. Generate stable unique string ids for all sections, entries, links, and skills.
8. Extract all content faithfully — do not summarize or omit content.`;
}

const REPO_IMPORT_SCHEMA = `{
  "source_label": "optional short label e.g. resume filename or LinkedIn",
  "profile": {
    "education": [
      {
        "school": "string",
        "degree": "optional string",
        "major": "optional string",
        "grad_date": "optional YYYY-MM or free text",
        "gpa": "optional string",
        "location": "optional string",
        "notes": "optional string — honors, coursework, activities"
      }
    ],
    "skills_note": "optional string — languages, tools, certifications not tied to one job",
    "other_fixed_facts": ["optional strings — contact, visa, awards, etc."]
  },
  "entries": [
    {
      "type": "experience | project",
      "title": "role or project name",
      "company": "optional employer or org",
      "position": "optional team or subtitle",
      "start_date": "optional YYYY-MM",
      "end_date": "optional YYYY-MM or null if ongoing",
      "freewrite": "raw narrative freewrite — NOT resume bullets. Include all bullet text as plain sentences/paragraphs with facts, metrics, tools, and context. Do NOT polish into action-verb bullets."
    }
  ]
}`;

const REPO_IMPORT_RULES = `CRITICAL OUTPUT FORMAT:
1. Return exactly ONE fenced code block: \`\`\`json ... \`\`\`
2. Schema:
${REPO_IMPORT_SCHEMA}
3. Extract EVERY distinct experience and project as separate entries — dedupe only exact duplicates within this source.
4. Put graduation date, major, degree, school, GPA in profile.education — also capture skills and fixed facts in profile when present.
5. freewrite must be raw warehouse notes (paragraphs or dash lines), never polished resume bullets.
6. Use type "experience" for jobs/internships/research roles; "project" for projects, hackathons, and coursework builds.
7. Dates as YYYY-MM when possible.
8. Put ALL education (school, degree, major, GPA, graduation date, honors, relevant coursework) in profile.education — never in entries.
9. Put skills, certifications, and other fixed facts in profile.skills_note / profile.other_fixed_facts.
10. No commentary outside the JSON block.
11. After the closing \`\`\` write exactly: ---END---`;

export function buildRepoImportFromPdfPrompt(filename?: string): string {
  return `Extract repository warehouse material from the attached resume PDF. This is NOT for a formatted resume editor — it feeds a freewrite warehouse for later AI resume building.

${REPO_IMPORT_RULES}
11. Set source_label to ${JSON.stringify(filename ?? 'resume PDF')}.
12. Include all employers and projects in entries; put education and skills in profile.`;
}

export function buildRepoImportFromProfileTextPrompt(
  profileText: string,
  sourceLabel: string,
): string {
  return `Extract repository warehouse material from this profile text (e.g. LinkedIn). Output freewrite warehouse entries, NOT resume bullets.

SOURCE: ${sourceLabel}

PROFILE TEXT:
"""
${profileText.slice(0, 48_000)}
"""

${REPO_IMPORT_RULES}
11. Set source_label to ${JSON.stringify(sourceLabel)}.
12. Extract all experiences and projects into entries; put education and skills in profile.`;
}

export function buildOptimizeResumePrompt(jobDescription: string): string {
  const jd = jobDescription.trim() || '(No job description provided — optimize for general impact and clarity.)';

  return `You are an expert resume optimizer tailoring a resume for a specific job.

JOB DESCRIPTION:
"""
${jd}
"""

Optimize the resume while keeping every fact truthful.

OPTIMIZATION RULES:
- Lead bullets with strong action verbs (Built, Led, Shipped, Reduced, Increased, etc.).
- Quantify impact wherever the source supports it (%, $, time saved, scale, users, latency).
- Tighten wording — every word should earn its place.
- Prioritize and reorder content to foreground what matters most for THIS job.
- Mirror legitimate JD keywords only where the candidate's real experience supports them.
- Do not invent employers, titles, dates, tools, or metrics.

${JD_HONESTY_RULES}

${OUTPUT_RULES}
5. Preserve section structure where sensible; you may add/remove/reorder bullets if it improves fit.
6. Return the full optimized resume JSON, not a partial diff.`;
}

export function buildOptimizeFromExtractPrompt(
  jobDescription: string,
  extracted: ResumeData,
): string {
  return `${buildOptimizeResumePrompt(jobDescription)}

The resume has already been extracted from the PDF. Optimize the JSON below:

\`\`\`json
${JSON.stringify(extracted, null, 2)}
\`\`\``;
}

export function buildOptimizePdfPrompt(jobDescription: string): string {
  const jd = jobDescription.trim() || '(No job description provided — optimize for general impact and clarity.)';

  return `You are an expert resume optimizer tailoring an attached resume PDF for a specific job.

JOB DESCRIPTION:
"""
${jd}
"""

Do this in ONE pass:
1. Extract the attached resume PDF faithfully into a baseline resume JSON.
2. Create an optimized version tailored to the job description.

Return both objects so the app can show an accurate before/after diff.

CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Return exactly ONE fenced code block: \`\`\`json ... \`\`\`
2. The JSON must match this wrapper schema:
{
  "baseline": ${RESUME_JSON_SCHEMA},
  "optimized": ${RESUME_JSON_SCHEMA}
}
3. "baseline" must preserve the PDF content faithfully — do not tailor, summarize, or omit content.
4. "optimized" must be a full tailored resume, not a diff.
5. For skills sections use the "skills" array and keep "entries" as [].
6. Generate stable unique string ids for baseline sections, entries, links, and skills.
7. Reuse the corresponding baseline ids in optimized whenever an item came from the same resume item; only generate new ids for genuinely new optimized structure.
8. Do not include commentary outside the JSON block.
9. After the closing \`\`\` write exactly: ---END---

OPTIMIZATION RULES:
- Lead bullets with strong action verbs (Built, Led, Shipped, Reduced, Increased, etc.).
- Quantify impact wherever the source supports it (%, $, time saved, scale, users, latency).
- Tighten wording — every word should earn its place.
- Prioritize and reorder content to foreground what matters most for THIS job.
- Mirror legitimate JD keywords only where the candidate's real experience supports them.
- Do not invent employers, titles, dates, tools, or metrics.
- Preserve truthful section structure where sensible; you may add/remove/reorder bullets if it improves fit.

${JD_HONESTY_RULES}`;
}

export function buildResumeFromRepositoryPrompt(
  jobDescription: string,
  sources: RepositorySource[],
): string {
  const jd = jobDescription.trim() || '(No job description provided — build a strong general resume.)';

  const payload = sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    type: source.type,
    title: source.title,
    company: source.company,
    position: source.position,
    dates: `${source.start_date ?? '?'} – ${source.end_date ?? (source.status === 'active' ? 'Present' : '?')}`,
    freewrite: source.freewrite,
  }));

  return `You are an expert resume writer. Build a tailored resume JSON for the job below using ONLY the candidate source material provided.

JOB DESCRIPTION:
"""
${jd}
"""

CANDIDATE SOURCE MATERIAL (freewrite notes — treat as raw truth, not resume bullets):
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

WRITING RULES:
- Convert freewrite material into polished resume bullets with action verbs, numbers, and impact.
- Select and prioritize experiences/projects that best fit the job description.
- Use a clean single-column resume structure: contact, education (if inferable), experience, projects, skills as appropriate.
- Do not invent employers, titles, dates, tools, or metrics not supported by the source material.
- If contact info is missing from sources, use placeholder links the user can edit later.

${JD_HONESTY_RULES}

${OUTPUT_RULES}
5. Generate stable unique string ids for all sections, entries, links, skills, and bullets.`;
}

export function buildAiPrompt(
  userInstruction: string,
  currentResume: ResumeData,
): string {
  const instruction = userInstruction.trim() || DEFAULT_USER_PROMPT;

  return `${instruction}

You are editing a resume. Apply the requested change to the resume content.

${OUTPUT_RULES}
3. Preserve section order, ids, jdComment fields, and structure whenever possible.

Current resume JSON:
\`\`\`json
${JSON.stringify(currentResume, null, 2)}
\`\`\``;
}

export function buildImprovementPrompt(
  userInstruction: string,
  currentResume: ResumeData,
): string {
  const instruction = userInstruction.trim() || 'Make one more small improvement.';

  return `${instruction}

Continue in this same chat. Update the resume from your previous response.

${JD_HONESTY_RULES}

Return ONLY the complete updated resume in one \`\`\`json code block using the same schema as before. Preserve jdComment fields unless your edit changes the match rationale. After the closing \`\`\` write exactly: ---END---

Current resume JSON:
\`\`\`json
${JSON.stringify(currentResume, null, 2)}
\`\`\``;
}

export function estimateWizardPromptTokens(
  prompt: string,
  pdfAttached = false,
): { promptTokens: number; note: string } {
  const promptTokens = Math.ceil(prompt.trim().length / 4);
  const note = pdfAttached
    ? 'PDF attachment not included in estimate — provider tokenizers count files separately.'
    : 'Text-only prompt estimate (~4 chars/token).';
  return { promptTokens, note };
}
