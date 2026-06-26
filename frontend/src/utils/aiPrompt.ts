import type { ResumeData } from '../types/resume';
import type { EducationData } from '../types/education';
import type { RepoItem, RepositorySource } from '../types/repository';

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

const REPOSITORY_RESUME_OUTPUT_RULES = `CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Write exactly ---JSON-START--- on its own line, then the raw JSON object, then ---JSON-END--- on its own line.
2. The JSON must match this schema:
${RESUME_JSON_SCHEMA}
3. For skills sections use the "skills" array and keep "entries" as [].
4. Generate stable unique string ids for all sections, entries, links, skills, and bullets.
5. Do not output the schema/example placeholders as content. The resume must contain real candidate material from the source notes.
6. No text outside the ---JSON-START--- / ---JSON-END--- delimiters.`;

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
      "merge_target_id": "optional existing repository id if this source should be merged into an existing item",
      "type": "experience | project",
      "title": "role or project name",
      "company": "optional employer or org",
      "position": "optional team or subtitle",
      "start_date": "optional YYYY-MM",
      "end_date": "optional YYYY-MM or null if ongoing",
      "freewrite": "raw narrative freewrite — NOT resume bullets. Include all bullet text as plain sentences/paragraphs with facts, metrics, tools, and context. Do NOT polish into action-verb bullets."
    }
  ],
  "contradictions": [
    {
      "category": "education | repository | profile | other",
      "field": "optional field name, e.g. school, degree, company, date",
      "existing_id": "id from existing context when available",
      "incoming_index": "zero-based index in profile.education for education contradictions, or entries[] for repository contradictions, when available",
      "existing_value": "the existing saved fact or object",
      "incoming_value": "the conflicting incoming fact or object",
      "reason": "short explanation of why both facts cannot be true at the same time"
    }
  ]
}`;

const REPO_IMPORT_RULES = `CRITICAL OUTPUT FORMAT:
1. Output the JSON object with NO fenced code block, NO commentary before or after.
2. Write exactly ---JSON-START--- on its own line, then the raw JSON object, then ---JSON-END--- on its own line.
3. Schema:
${REPO_IMPORT_SCHEMA}
4. Extract EVERY distinct experience and project as separate entries — dedupe only exact duplicates within this source.
5. Put graduation date, major, degree, school, GPA in profile.education — also capture skills and fixed facts in profile when present.
6. freewrite must be raw warehouse notes (paragraphs or dash lines), never polished resume bullets.
7. Use type "experience" for jobs/internships/research roles; "project" for projects, hackathons, and coursework builds.
8. Dates as YYYY-MM when possible.
9. Put ALL education (school, degree, major, GPA, graduation date, honors, relevant coursework) in profile.education — never in entries.
10. Put skills, certifications, and other fixed facts in profile.skills_note / profile.other_fixed_facts.
11. Compare the source against EXISTING REPOSITORY CONTEXT and EXISTING EDUCATION INFO CONTEXT when provided. If an incoming fact contradicts an existing saved fact, add a record to "contradictions" instead of silently merging it.
12. Contradictions are mutually exclusive identity facts that need human review, e.g. same degree/major but different school, same role/date but different employer, different graduation dates for the same school/degree, or incompatible titles for the same dated role.
13. Additive facts are NOT contradictions. Example: existing skills say Python/SQL/Java and incoming skills say Docker/AWS/GCP; merge those into profile.skills_note without a contradiction.
14. For education contradictions, include existing_id from the existing education item and incoming_index pointing to the profile.education item that conflicts.
15. For repository contradictions, include existing_id from the existing repository item and incoming_index pointing to the entries[] item that conflicts.
16. For profile/meta contradictions, set field to "skills_note" or "other_fixed_facts" when applicable.
17. If there are no contradictions, output "contradictions": [].
18. No text outside the ---JSON-START--- / ---JSON-END--- delimiters.`;

function trimForPrompt(value: string | null | undefined, max = 1800): string {
  const text = (value ?? '').trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}\n...[truncated]`;
}

function buildExistingRepositoryContext(existingItems?: RepoItem[]): string {
  const items = (existingItems ?? []).filter((item) => item.title?.trim());
  if (items.length === 0) {
    return '';
  }

  const compact = items.slice(0, 40).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    company: item.company,
    position: item.position,
    start_date: item.start_date,
    end_date: item.end_date,
    mode: item.mode,
    content: trimForPrompt(item.content),
  }));

  return `\n\nEXISTING REPOSITORY CONTEXT:\n${JSON.stringify(compact, null, 2)}\n\nMERGE RULES AGAINST EXISTING REPOSITORY:\n- If the attached/source material describes the same experience or project as an existing repository item, do NOT create a duplicate.\n- For that entry, set "merge_target_id" to the existing item's id.\n- When using "merge_target_id", write "freewrite" as ONLY the missing or more specific facts from the new source that should be appended to that existing item. Do not repeat facts already present in existing content.\n- If the source item is genuinely new, omit "merge_target_id" or set it to null.\n- Preserve the existing item's identity; the app will append your new freewrite to it.`;
}

function buildExistingEducationContext(existingEducation?: EducationData): string {
  const items = existingEducation?.items ?? [];
  const meta = existingEducation?.meta;
  const hasMeta = Boolean(meta?.skills_note?.trim() || meta?.other_notes?.trim());

  if (items.length === 0 && !hasMeta) {
    return '';
  }

  const compact = {
    education: items.slice(0, 12).map((item) => ({
      id: item.id,
      school: item.school,
      degree: item.degree,
      major: item.major,
      grad_date: item.grad_date,
      gpa: item.gpa,
      location: item.location,
      coursework: trimForPrompt(item.coursework, 900),
    })),
    skills_note: trimForPrompt(meta?.skills_note, 1200),
    other_notes: trimForPrompt(meta?.other_notes, 1200),
  };

  return `\n\nEXISTING EDUCATION INFO CONTEXT:\n${JSON.stringify(compact, null, 2)}\n\nMERGE RULES AGAINST EXISTING EDUCATION INFO:\n- If the source repeats an existing school/degree with no new details, omit it from profile.education.\n- If the source adds missing GPA, graduation date, coursework, honors, or location for an existing school, include only those useful details in profile.education so the app can merge them.\n- If the source appears to describe the same education credential but conflicts on a mutually exclusive field (for example BS in CS from Harvard vs BS in CS from Stanford, or same school/degree with different graduation dates), include the incoming education record in profile.education and add a contradictions[] item with category "education", existing_id, incoming_index, existing_value, incoming_value, and reason.\n- For skills_note and other_fixed_facts, include only facts that are missing or more specific than the existing notes. Do not repeat skills or facts already present.`;
}

export function buildRepoImportFromPdfPrompt(
  filename?: string,
  existingItems?: RepoItem[],
  existingEducation?: EducationData,
): string {
  return `Extract repository warehouse material from the attached resume PDF. This is NOT for a formatted resume editor — it feeds a freewrite warehouse for later AI resume building.

${REPO_IMPORT_RULES}
11. Set source_label to ${JSON.stringify(filename ?? 'resume PDF')}.
12. Include all employers and projects in entries; put education and skills in profile.${buildExistingRepositoryContext(existingItems)}${buildExistingEducationContext(existingEducation)}`;
}

export function buildRepoImportFromProfileTextPrompt(
  profileText: string,
  sourceLabel: string,
  existingItems?: RepoItem[],
  existingEducation?: EducationData,
): string {
  return `Extract repository warehouse material from this profile text (e.g. LinkedIn). Output freewrite warehouse entries, NOT resume bullets.

SOURCE: ${sourceLabel}

PROFILE TEXT:
"""
${profileText.slice(0, 48_000)}
"""

${REPO_IMPORT_RULES}
11. Set source_label to ${JSON.stringify(sourceLabel)}.
12. Extract all experiences and projects into entries; put education and skills in profile.${buildExistingRepositoryContext(existingItems)}${buildExistingEducationContext(existingEducation)}`;
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

${REPOSITORY_RESUME_OUTPUT_RULES}`;
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
