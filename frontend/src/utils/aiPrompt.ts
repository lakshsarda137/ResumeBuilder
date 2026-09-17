import type { ResumeData } from '../types/resume';
import type { EducationData } from '../types/education';
import type { RepoItem, RepositorySource } from '../types/repository';
import type { CandidateLabel } from '../types/council';
import {
  buildResumeStyleInstructions,
  type ResumeBuildStyleProfile,
} from './resumeBuildStyle';
import { EM_DASH_PROMPT_RULE } from './emDash';
import { RESUME_WRITING_CONTRACT } from './resumeWritingRules';
import {
  buildCouncilAngleBlock,
  buildCouncilAngleMergeBlock,
  type CouncilDraftAngle,
} from './councilAngles';
import { PERSONAL } from '../personal';

export const RESUME_JSON_SCHEMA = `{
  "contact": {
    "name": "string",
    "links": [{ "id": "string", "value": "string — email, phone, or URL (the link target)", "label": "optional string — the hyperlinked word shown instead of the URL: \"LinkedIn\" or \"GitHub\". Omit for email and phone." }]
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
          "title": "string — top-line label. For experience entries, this MUST be the employer/company/org name, not the job title. For projects, use the project name; for education, use the school.",
          "location": "string — ALWAYS \"\" for experience and project entries; only education may carry a location",
          "date": "string — experience/projects: \"Mon YYYY – Mon YYYY\"; education: graduation only, e.g. \"May 2029 (Expected Graduation)\"",
          "titleNote": "optional string — experience entries only: accelerator/program selection shown unbolded on the top line beside the title, e.g. \\"${PERSONAL.promptExamples.accelerator.titleNote}\\". Omit when there is none.",
          "subtitle": "string — for experience entries, job title/role only (no technologies). Do not put the employer/company here unless needed for non-experience context. For project entries, leave subtitle empty — do not add 'Founder', 'Co-Founder', 'Creator', 'Builder', or any self-assigned title.",
          "links": "optional array of { \"label\": string, \"url\": string } — hyperlinks rendered after the title as 'Title | GitHub | Play Online'. Copy the source's \"links\" array exactly (same labels, same URLs, same order) when the source provides one; otherwise include a link ONLY when the source material explicitly contains that URL (label it 'GitHub' for code repositories, 'Website' for live sites). Never invent, guess, or reconstruct a URL. Never put a raw URL in title, subtitle, or bullet text — this field is the only place it goes.",
          "jdComment": "optional — how this entry matches the job description",
          "bullets": [
            {
              "text": "string — plain text ending in a full stop, no bold",
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

const EDIT_RESUME_WRITING_RULES = `RESUME STRUCTURE RULES (preserve unless the user explicitly asks to change layout):
- Experience format is company-first: for every experience entry, put the employer/company/org name in entry.title so the renderer places it on the same baseline as entry.date; put only the job title/role in entry.subtitle on the line below. Do not put job title and date together on the top line.
- Do not add technologies, tools, or tech stacks to entry.subtitle. Keep tools in bullets or the Technical Skills section only.
- Hard layout constraint: never put a tech stack beside an entry name/title.
- Project subtitle rule: for project-type entries, leave entry.subtitle empty. Never add "Founder", "Co-Founder", "Creator", "Builder", or any self-assigned role title to a project entry's subtitle.`;

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
        "start_date": "optional YYYY-MM — when the candidate started at this school",
        "grad_date": "optional YYYY-MM or free text",
        "gpa": "optional string",
        "location": "optional string",
        "notes": "optional string — honors, coursework, activities"
      }
    ],
    "skills_note": "optional string — languages, tools, certifications not tied to one job",
    "other_fixed_facts": ["optional strings — contact details, awards, certifications, etc."]
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
      "freewrite": "raw narrative freewrite — NOT resume bullets. For new entries, describe this source item. For merge_target_id entries, rewrite the complete coherent warehouse description that should replace the existing entry by combining existing context with source facts."
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
      "reason": "short explanation of why both facts cannot be true at the same time",
      "resolution_options": {
        "existing": {
          "type": "optional experience | project",
          "title": "optional role or project name",
          "company": "optional employer or org",
          "position": "optional team or subtitle",
          "start_date": "optional YYYY-MM",
          "end_date": "optional YYYY-MM or null",
          "freewrite": "optional clean final description if the existing value is chosen"
        },
        "incoming": {
          "type": "optional experience | project",
          "title": "optional role or project name",
          "company": "optional employer or org",
          "position": "optional team or subtitle",
          "start_date": "optional YYYY-MM",
          "end_date": "optional YYYY-MM or null",
          "freewrite": "optional clean final description if the incoming value is chosen"
        }
      }
    }
  ]
}`;

const REPO_IMPORT_RULES = `CRITICAL OUTPUT FORMAT:
1. Output the JSON object with NO fenced code block, NO commentary before or after.
2. Write exactly ---JSON-START--- on its own line, then the raw JSON object, then ---JSON-END--- on its own line.
3. Schema:
${REPO_IMPORT_SCHEMA}
4. Extract EVERY distinct experience and project as separate entries — dedupe only exact duplicates within this source.
5. Put start date, graduation date, major, degree, school, GPA in profile.education — also capture skills and fixed facts in profile when present. When the source shows an education date range, the first date is start_date and the second is grad_date.
6. freewrite must be raw warehouse notes (paragraphs or dash lines), never polished resume bullets.
7. For entries with merge_target_id, freewrite must be the full coherent replacement description for the saved repository item, combining useful existing context with useful source facts. Do NOT write "new facts", "to append", "differs from existing", "see contradictions", or any audit/commentary language.
8. For entries without merge_target_id, freewrite describes the new source item only.
9. Keep maximum resume-useful source detail in freewrite: responsibilities, accomplishments, technical work, products/features, scale, metrics, tools, collaborators, research/project context, and constraints. Preserve any project/repository/demo URLs (GitHub links, live sites) exactly as written — they are later used to hyperlink the project on the resume.
10. Filter out egregiously irrelevant LinkedIn/page noise: "follows this company", company follower counts, generic company profile stats, connection counts, reactions, comments, reposts, navigation labels, ads, recommendations unrelated to the candidate's own work, and job-alert/page chrome. Include company or audience numbers only when they describe the candidate's actual impact or project scope.
11. Use type "experience" for jobs/internships/research roles; "project" for projects, hackathons, and coursework builds.
12. Dates as YYYY-MM when possible.
13. Put ALL education (school, degree, major, GPA, graduation date, honors, relevant coursework) in profile.education — never in entries.
14. Put skills, certifications, and other fixed facts in profile.skills_note / profile.other_fixed_facts.
14a. Never capture visa or work-authorization status, citizenship, nationality, gender, age, marital status, religion, or any other protected personal attribute, in any field. Drop it from the source entirely rather than storing it — none of it belongs on a resume.
15. Compare the source against EXISTING REPOSITORY CONTEXT and EXISTING EDUCATION INFO CONTEXT when provided. If an incoming fact contradicts an existing saved fact, add a record to "contradictions" instead of silently merging it.
16. Contradictions are mutually exclusive identity facts that need human review, e.g. same degree/major but different school, same role/date but different employer, different graduation dates for the same school/degree, or incompatible titles for the same dated role.
17. Additive facts are NOT contradictions. Example: existing skills say Python/SQL/Java and incoming skills say Docker/AWS/GCP; merge those into profile.skills_note without a contradiction.
18. For education contradictions, include existing_id from the existing education item and incoming_index pointing to the profile.education item that conflicts.
19. For repository contradictions, include existing_id from the existing repository item and incoming_index pointing to the entries[] item that conflicts. Also include resolution_options.existing and resolution_options.incoming. Each option should contain the clean repository fields/freewrite that should be saved if that choice is accepted. The two freewrite options must be coherent final descriptions, not notes about the conflict.
20. For profile/meta contradictions, set field to "skills_note" or "other_fixed_facts" when applicable.
21. If there are no contradictions, output "contradictions": [].
22. No text outside the ---JSON-START--- / ---JSON-END--- delimiters.`;

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

  return `\n\nEXISTING REPOSITORY CONTEXT:\n${JSON.stringify(compact, null, 2)}\n\nMERGE RULES AGAINST EXISTING REPOSITORY:\n- If the attached/source material describes the same experience or project as an existing repository item, do NOT create a duplicate.\n- For that entry, set "merge_target_id" to the existing item's id.\n- When using "merge_target_id", write "freewrite" as a complete, coherent replacement for the existing repository content. It must combine the useful existing content with useful source facts into one clean description.\n- Do not write append-only notes, change logs, contradiction notes, or phrases like "new/more-specific facts".\n- If the source item is genuinely new, omit "merge_target_id" or set it to null.`;
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
      start_date: item.start_date,
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

export function buildResumeEducationContext(existingEducation?: EducationData): string {
  const items = existingEducation?.items ?? [];
  const meta = existingEducation?.meta;
  const hasMeta = Boolean(meta?.skills_note?.trim() || meta?.other_notes?.trim());

  if (items.length === 0 && !hasMeta) {
    return `\n\nEDUCATION / PROFILE CONTEXT:\nNo saved education, skills-note, or other-note context was provided. Do not invent schools, degrees, GPA, dates, coursework, phone numbers, email addresses, or placeholder values. If a requested section has no source support, omit that section or leave the field empty.`;
  }

  const compact = {
    education: items.slice(0, 12).map((item) => ({
      school: item.school,
      degree: item.degree,
      major: item.major,
      start_date: item.start_date,
      grad_date: item.grad_date,
      gpa: item.gpa,
      location: item.location,
      coursework: trimForPrompt(item.coursework, 900),
    })),
    skills_note: trimForPrompt(meta?.skills_note, 1600),
    other_notes: trimForPrompt(meta?.other_notes, 1600),
  };

  return `\n\nEDUCATION / PROFILE CONTEXT (source truth for education, skills, contact notes, awards, coursework):\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\`\n\nEducation rules:\n- Use this context for the Education section when it contains saved education records.\n- Keep education concise: school, location, degree/major, dates, GPA/honors/coursework only when present above.
- The education entry's date field shows ONLY the graduation date from grad_date, never start_date: "May 2029 (Expected Graduation)" for a degree still in progress, plain "May 2025" for a completed one. A range such as "Aug 2025 – May 2029" is a defect.\n- Resume convention: keep the degree/major line clean. Put GPA and honors/awards together in their own compact bullet, e.g. "${PERSONAL.promptExamples.educationHonors}".\n- Coursework may be one compact bullet only when useful; label it "Relevant Coursework:" rather than "GPA" or generic notes.\n- Skills or fixed facts in skills_note / other_notes may inform Technical Skills or contact only when explicitly supported.\n- Do not invent missing education/contact facts. Never write placeholder text like "(edit)", "(edit degree)", "your.email@example.com", "(000) 000-0000", "Expected May 20XX", "GPA: X.XX", or "[add your coursework here]".`;
}

export function buildRepoImportFromPdfPrompt(
  filename?: string,
  existingItems?: RepoItem[],
  existingEducation?: EducationData,
): string {
  return `Extract repository warehouse material from the attached resume PDF. This is NOT for a formatted resume editor — it feeds a freewrite warehouse for later AI resume building.

${REPO_IMPORT_RULES}
Set source_label to ${JSON.stringify(filename ?? 'resume PDF')}.
Include all employers and projects in entries; put education and skills in profile.${buildExistingRepositoryContext(existingItems)}${buildExistingEducationContext(existingEducation)}`;
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
Set source_label to ${JSON.stringify(sourceLabel)}.
Extract all experiences and projects into entries; put education and skills in profile.${buildExistingRepositoryContext(existingItems)}${buildExistingEducationContext(existingEducation)}`;
}

export function buildOptimizeResumePrompt(
  jobDescription: string,
  styleInstructions?: string,
): string {
  const jd = jobDescription.trim() || '(No job description provided — optimize for general impact and clarity.)';

  const styleBlock = styleInstructions?.trim()
    ? `\n\nRENDER / CONTENT SETTINGS the optimized resume must honor:\n${styleInstructions.trim()}\n`
    : '';

  return `You are an expert resume writer tailoring a resume for a specific job.

JOB DESCRIPTION:
"""
${jd}
"""
${styleBlock}
Optimize the resume while keeping every fact truthful.

${RESUME_WRITING_CONTRACT}

OPTIMIZATION RULES:
- Rewrite every bullet to the standard above; do not simply pass through the original wording.
- Prioritize and reorder content to foreground what matters most for THIS job.
- Tighten wording. Every word should earn its place.
- Do not invent employers, titles, dates, tools, or metrics.
- Experience format is company-first: put the employer/company/org in entry.title so it renders on the same baseline as entry.date; put the job title/role first in entry.subtitle on the line below.
- Project subtitle rule: for project-type entries, leave entry.subtitle empty. Never add "Founder", "Co-Founder", "Creator", "Builder", or any self-assigned role title to a project entry's subtitle.

${EM_DASH_PROMPT_RULE}

${JD_HONESTY_RULES}

${OUTPUT_RULES}
5. Preserve section structure where sensible; you may add/remove/reorder bullets if it improves fit.
6. Return the full optimized resume JSON, not a partial diff.`;
}

export function buildOptimizeFromExtractPrompt(
  jobDescription: string,
  extracted: ResumeData,
  styleInstructions?: string,
): string {
  return `${buildOptimizeResumePrompt(jobDescription, styleInstructions)}

The resume has already been extracted from the PDF. Optimize the JSON below:

\`\`\`json
${JSON.stringify(extracted, null, 2)}
\`\`\``;
}

export function buildOptimizePdfPrompt(
  jobDescription: string,
  styleInstructions?: string,
): string {
  const jd = jobDescription.trim() || '(No job description provided — optimize for general impact and clarity.)';

  const styleBlock = styleInstructions?.trim()
    ? `\nRENDER / CONTENT SETTINGS the optimized resume must honor:\n${styleInstructions.trim()}\n`
    : '';

  return `You are an expert resume writer tailoring an attached resume PDF for a specific job.

JOB DESCRIPTION:
"""
${jd}
"""
${styleBlock}
Do this in ONE pass:
1. Extract the attached resume PDF faithfully into a baseline resume JSON.
2. Create an optimized version tailored to the job description.

Return both objects so the app can show an accurate before/after diff.

CRITICAL OUTPUT FORMAT — the editor can ONLY load JSON:
1. Write exactly ---JSON-START--- on its own line, then the raw JSON object, then ---JSON-END--- on its own line.
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
8. Do not include commentary, Markdown fences, or text outside the ---JSON-START--- / ---JSON-END--- delimiters.

The "baseline" object is a faithful transcription and is NOT subject to the writing rules below. Apply every rule below to "optimized" only.

${RESUME_WRITING_CONTRACT}

OPTIMIZATION RULES (for "optimized"):
- Rewrite every bullet to the standard above; do not simply pass through the original PDF wording.
- Prioritize and reorder content to foreground what matters most for THIS job.
- Tighten wording. Every word should earn its place.
- Do not invent employers, titles, dates, tools, or metrics.
- Experience format is company-first: put the employer/company/org in entry.title so it renders on the same baseline as entry.date; put the job title/role first in entry.subtitle on the line below.
- Project subtitle rule: for project-type entries, leave entry.subtitle empty. Never add "Founder", "Co-Founder", "Creator", "Builder", or any self-assigned role title to a project entry's subtitle.
- Preserve truthful section structure where sensible; you may add/remove/reorder bullets if it improves fit.

${EM_DASH_PROMPT_RULE}

${JD_HONESTY_RULES}`;
}

/**
 * Compact, prompt-friendly projection of repository sources. Shared by the
 * candidate build prompt and the judge prompt so the judge sees the exact same
 * ground-truth freewrite material the candidates were built from.
 */
export function mapRepositorySourcesForPrompt(sources: RepositorySource[]) {
  return sources.map((source) => ({
    id: source.id,
    kind: source.kind,
    type: source.type,
    title: source.title,
    company: source.company,
    position: source.position,
    dates: `${source.start_date ?? '?'} – ${source.end_date ?? 'Present'}`,
    links: source.links.length > 0 ? source.links : undefined,
    freewrite: source.freewrite,
  }));
}

export function buildResumeFromRepositoryPrompt(
  jobDescription: string,
  sources: RepositorySource[],
  styleProfile: ResumeBuildStyleProfile,
  customStyleInstructions: string,
  educationData?: EducationData,
  /** Council runs only: the angle this candidate's draft takes. */
  councilAngle?: CouncilDraftAngle | null,
): string {
  const jd = jobDescription.trim() || '(No job description provided — build a strong general resume.)';

  const payload = mapRepositorySourcesForPrompt(sources);
  const angleBlock = councilAngle ? `\n${buildCouncilAngleBlock(councilAngle)}\n` : '';

  return `You are an expert resume writer. Build a tailored resume JSON for the job below using ONLY the candidate source material provided.
${angleBlock}

JOB DESCRIPTION:
"""
${jd}
"""

${buildResumeStyleInstructions(styleProfile, customStyleInstructions)}

CANDIDATE SOURCE MATERIAL (freewrite notes — treat as raw truth, not resume bullets):
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
${buildResumeEducationContext(educationData)}

${RESUME_WRITING_CONTRACT}

SELECTION AND LAYOUT RULES (the settings block above owns page limit, section order, entry count, and bullet counts; do not re-derive those here):
- Select the experiences/projects that best fit the job description and have enough source detail for credible bullets. Do NOT include every repository source: omit entries with little more than a title, company, and date.
- Order by strength, not by date. Experience entries stay reverse-chronological, but project entries are ordered by how impressive they are for THIS job, strongest first. Inside every entry, the bullets are ordered strongest story first: the anchor bullet carries the entry's best work, and the weakest bullet is last. Do not default to the order the source material happens to use.
- Convert selected freewrite material into polished resume bullets that follow the writing standard above. The freewrite is raw truth, not a draft to lightly edit.
- A single source often describes several distinct systems (one internship freewrite may cover several separate products). Before writing, list the distinct workstreams in that source, decide how many bullets each earns from its impact and job relevance within the entry's bullet budget, and keep every bullet inside one workstream. Never merge two workstreams into one bullet to "cover" both; drop the weaker one instead.
- Project entries must be recognisable from their own bullets: the first bullet says what the project is and does in plain words, with its most impressive technical idea stated accessibly. A project whose bullets only list tools and percentages has failed.
- Experience entries are company-first: put the employer/company/org name in entry.title so it renders on the same baseline as entry.date, and put the job title/role first in entry.subtitle on the line below. Never put job title and date together on the top line.
- Project entries leave entry.subtitle empty. Never add "Founder", "Co-Founder", "Creator", "Builder", or any self-assigned role title.
- Hyperlinks: when a source has a "links" array, copy it verbatim into the entry's "links" (same labels, URLs, and order) — the labels were chosen by the candidate (e.g. "Play Online"). If a source has no "links" but its freewrite explicitly contains a project URL (GitHub repository, live demo, published site), add it as { "label": "GitHub" | "Website", "url": ... } exactly as written. Never invent or guess a URL, never attach a URL from one source to a different entry, and omit "links" entirely when the source has none. Do not write raw URLs into title, subtitle, or bullet text.
- Never put a tech stack beside an entry name/title. Tools belong in the subtitle line below the title, in bullets, or in skills.
- Single-column structure, only the sections the settings block asks for.
- Do not invent employers, titles, dates, tools, or metrics that the source material does not support.
- Contact: LinkedIn and GitHub appear on the header line only as the hyperlinked words "LinkedIn" and "GitHub" (set "label"), never as a visible URL. Do not promote a project/product/company URL into the header as the candidate's personal site. A startup domain is not a personal website unless the source says so. If a contact fact is missing, leave it empty rather than inventing one.
- Never write placeholder or meta text in any visible field: no "(edit)", no "your.email@example.com", no "Expected May 20XX", no todo notes, no instructions to the reader.
- Inline HTML in string fields is limited to <em> for italic context. Never <strong>, <b>, or any font-weight styling (see NO BOLD above). No Markdown.

${EM_DASH_PROMPT_RULE}

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

${EDIT_RESUME_WRITING_RULES}

Any bullet text you write or rewrite must satisfy the standard below. Leave bullets you are not touching alone.

${RESUME_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

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

${EDIT_RESUME_WRITING_RULES}

Any bullet text you write or rewrite must satisfy the standard below. Leave bullets you are not touching alone.

${RESUME_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

${JD_HONESTY_RULES}

Return ONLY the complete updated resume in one \`\`\`json code block using the same schema as before. Preserve jdComment fields unless your edit changes the match rationale. After the closing \`\`\` write exactly: ---END---

Current resume JSON:
\`\`\`json
${JSON.stringify(currentResume, null, 2)}
\`\`\``;
}

// ---------------------------------------------------------------------------
// LLM Council — judge prompt construction
// ---------------------------------------------------------------------------

export interface CouncilJudgeCandidate {
  label: CandidateLabel;
  resume: ResumeData;
  /** Repository council runs: the angle the draft was written from. */
  angle?: CouncilDraftAngle | null;
}

/**
 * What the judge scores. Replaced a 7-dimension rubric whose per-dimension
 * rationales cost the judge a large amount of output before it ever reached the
 * resume it actually ships. One number and a short justification leaves the
 * budget where it matters.
 */
const ATS_SCORING_RULES = `SCORING (do this briefly, then spend your real effort on the resume):
Give each candidate a single score from 0 to 100 that answers ONE question: after a 10-second scan, would a non-technical recruiter (an English or psychology major, not a computer science major) understand and want to interview this candidate, and on a full read would a technical hiring manager respect the engineering? Score from those two readers' chairs, not from a checklist:
- what the non-technical reader can say after reading only the FIRST bullet of each entry: what was built, who it was for, how it works in plain words, and the headline metric. A first bullet full of framework names, algorithm names, or acronyms fails this reader and costs real points. Fluffy, vague first bullets fail too. Exception: an experience entry whose source covers several separate projects (such as an internship) is not held to this first-bullet test;
- whether the LATER bullets give the technical manager real engineering: the stack, the design decisions, the hard problems solved. Later bullets that only rephrase the first bullet cost points;
- how much of the candidate's strongest material is visible first: ownership (led, sole, primary developer), selectivity and validation (accelerator acceptance, awards, real users), the recognizable discipline of the work, the biggest results. A draft that buries these under weaker facts or tool lists scores lower than one that leads with them;
- substance an engineer would respect: concrete systems, real scale, real numbers, hard problems solved, with no padding or unsupported claims;
- readability: plain sentences each reader parses on a single read, no jargon walls, no acronym soup;
- keyword coverage of the job description is a TIEBREAKER only, and only for terms sitting inside plain sentences the candidate's real work supports. A draft that crams more keywords into harder-to-read sentences must NOT outscore a plainer, more impressive draft.

MECHANICAL CHECK — things you can verify by reading a candidate's JSON directly, so deduct only for what you can actually see:
- LINE FILL — every experience/project bullet is either 18-21 words (one full line) or 40-42 words (two full lines). Count the words. A bullet of 1-17, 22-39, or 43+ words leaves a line partly empty or spills to a third line, and is a defect.
- TENSE — bullets under an entry whose dates end in "Present" are present tense, every other entry is past tense, and no entry mixes the two.
- DATES — experience/project date fields read "Mon YYYY – Mon YYYY" or "Mon YYYY – Present", consistently. Education shows ONLY the graduation date, e.g. "May 2029 (Expected Graduation)"; an education start date or range is a defect.
- PUNCTUATION — every experience, project, and custom bullet ends with a full stop.
- LOCATION — every experience and project entry has an empty location. Any city, state, or "Remote" on an internship, startup, or project is a defect.
- HEADER — LinkedIn and GitHub carry "label" values ("LinkedIn", "GitHub") so no full profile URL shows on the header line.
- TITLE NOTE — an accelerator or program selection (e.g. ${PERSONAL.promptExamples.accelerator.programName}) sits in the entry's "titleNote" beside the name, not in the subtitle or a bullet.
- SKILLS — exactly two one-line rows, labelled "Languages" and "Tools".
- NO BOLD — no <strong>, <b>, or font-weight anywhere in the JSON.
- VERBS — every bullet opens with an action verb, no leading verb repeats anywhere in the resume, and none is on the banned list.
- DENSITY — each entry's bullet count sits inside the range the render/content settings above specify, with the strongest entries at the higher end.
- SUBSTANCE — bullets state accomplishments and outcomes, not the duties the role nominally involved.
- ONE SUBJECT — no bullet fuses two distinct systems or pieces of work into one sentence; a fused bullet is a serious defect, not a style nit.
- ANCHOR — the first bullet of every project and single-project experience entry tells a non-technical reader, in plain words, what was built, for whom, and how.

Then write a justification of 3-4 lines for each score: what carried it, and what specifically cost it points. Plain sentences, no headings, no bullet lists, no per-criterion breakdown. Do not walk the mechanical check item by item — it informs the number, and earns at most one clause of the justification when a candidate actually fails something.`;

/**
 * Build the anonymized judge prompt. Candidates are labelled A/B/C only — the
 * judge must never learn which provider produced which resume.
 */
export function buildCouncilJudgePrompt({
  path,
  jobDescription,
  candidates,
  styleInstructions,
  sources,
}: {
  path: 'repository' | 'optimize';
  jobDescription: string;
  candidates: CouncilJudgeCandidate[];
  styleInstructions?: string;
  /**
   * Repository path only: the ground-truth freewrite sources the candidates
   * were built from. Giving the judge this material lets it verify factual
   * fidelity and reward truthful, well-sourced drafts.
   */
  sources?: RepositorySource[];
}): string {
  const hasJd = jobDescription.trim().length > 0;
  const jd =
    jobDescription.trim() ||
    '(No job description provided — judge for general impact, clarity, and one-page fit.)';

  const noJdRule = hasJd
    ? ''
    : `\nNO JOB DESCRIPTION PROVIDED: score each candidate on general ATS readiness instead — parseable structure, concrete evidence, and absence of padding. Say in the justification that no job description was supplied, so keyword coverage could not be assessed.\n`;

  const candidateBlocks = candidates
    .map(
      (candidate) =>
        `CANDIDATE ${candidate.label}:\n\`\`\`json\n${JSON.stringify(
          candidate.resume,
          null,
          2,
        )}\n\`\`\``,
    )
    .join('\n\n');

  const finalSchemaNote =
    path === 'optimize'
      ? `"final" MUST be a single optimized resume object matching this schema (the app supplies the baseline for the before/after diff, so do NOT include a baseline):\n${RESUME_JSON_SCHEMA}`
      : `"final" MUST be a single resume object matching this schema:\n${RESUME_JSON_SCHEMA}`;

  const styleBlock = styleInstructions?.trim()
    ? `\n\nRENDER / CONTENT SETTINGS the final resume must honor:\n${styleInstructions.trim()}\n`
    : '';

  const angleMergeBlock = buildCouncilAngleMergeBlock(candidates);
  const angleBlock = angleMergeBlock ? `\n${angleMergeBlock}\n` : '';

  const sourceBlock =
    path === 'repository' && sources && sources.length > 0
      ? `\nCANDIDATE SOURCE MATERIAL (ground-truth freewrite notes every draft was built from — judge factual fidelity against this: reward drafts that surfaced the strongest real evidence and stayed truthful, and penalize any employer, title, date, tool, or metric a draft asserts that is NOT supported here):\n\`\`\`json\n${JSON.stringify(
          mapRepositorySourcesForPrompt(sources),
          null,
          2,
        )}\n\`\`\`\n`
      : '';

  return `You are the impartial JUDGE on a panel evaluating several anonymized resume drafts for the same job. Each draft was written by a different system, but you do NOT know which — judge purely on merit. Do not speculate about authorship.

JOB DESCRIPTION:
"""
${jd}
"""
${styleBlock}${noJdRule}${sourceBlock}${angleBlock}
CANDIDATE RESUMES (anonymized):

${candidateBlocks}

YOUR TASKS:
1. Give each candidate one ATS score out of 100 plus a 3-4 line justification, per the scoring rules below.
2. Synthesize a single best-of-all-worlds final resume that combines the strongest, most truthful, most job-relevant content across the candidates. Do not invent facts that no candidate supports. Keep it to one page.
3. Write concise synthesis notes explaining what you borrowed from which anonymized candidate (refer to them only as Candidate A/B/C) and why.

Task 2 is the one that matters. Task 1 exists to inform it, so keep the scoring short.

${ATS_SCORING_RULES}

The writing standard below is the SAME contract every candidate was given. Your "final" resume is what actually ships, so it must satisfy this contract even where no candidate did. Where the best candidate content violates it, keep the content and rewrite the wording.

${RESUME_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

${JD_HONESTY_RULES}

CRITICAL OUTPUT FORMAT — the app can ONLY load delimited JSON:
1. Write exactly ---JSON-START--- on its own line, then ONE raw JSON object, then ---JSON-END--- on its own line.
2. The JSON object must have exactly these top-level keys: "scores", "synthesisNotes", "final".
3. "scores" is an object keyed by candidate label ("A", "B"${candidates.length > 2 ? ', "C"' : ''}). Each value is:
   { "atsScore": <integer 0-100>, "justification": "<3-4 lines of plain sentences>" }
   Include one entry for every candidate shown above. No other keys.
4. "synthesisNotes" is a plain string (no markdown headings required).
5. ${finalSchemaNote}
6. For skills sections use the "skills" array and keep "entries" as [].
7. Generate stable unique string ids for all sections, entries, links, skills, and bullets in "final".
8. Inline HTML in string fields is limited to <em> only. Never use <strong>, <b>, font-weight, <mark>, or color/background styling, even where a candidate draft did: strip any bold you inherit.
9. Layout rules for "final": every experience and project entry has "location": ""; LinkedIn/GitHub contact links carry "label"; an accelerator selection goes in "titleNote"; the skills section is exactly the two rows "Languages" and "Tools"; every experience/project bullet is 18-21 or 40-42 words and ends with a full stop. Fix any candidate content that breaks these.
10. Project subtitle rule: for project-type entries in "final", leave entry.subtitle empty. Never add "Founder", "Co-Founder", "Creator", "Builder", or any self-assigned role title to a project entry's subtitle — even if a candidate draft included one.
11. Entry "links" fields: when a candidate's entry carries "links" that the source material supports (a source's "links" array or a URL in its freewrite), keep them on the corresponding entry in "final" with their labels unchanged. Never invent a URL no candidate or source provides, and drop any URL the source material does not support.
12. No text, commentary, or markdown fences outside the ---JSON-START--- / ---JSON-END--- delimiters.`;
}

/**
 * Small cover instruction paired with the judge prompt when it is delivered as
 * a plain-text (.txt) attachment instead of being typed into the composer.
 * Gemini's composer silently truncates very large pasted prompts — which cuts
 * off the tail of the judge prompt where the output-format contract lives — so
 * for Gemini we attach the full task as a file and send this short cover note
 * telling the model to execute the attachment and reply only with the JSON.
 */
/**
 * Cover note for the resume-build task when it is delivered as a plain-text
 * (.txt) attachment instead of being typed into the composer. Same reason as
 * the judge cover prompt: Gemini's composer silently truncates very large
 * pasted prompts, and the output-format contract lives at the tail of the
 * build prompt, so a truncated send loses the JSON delimiters entirely.
 */
export function buildResumeBuildCoverPrompt(filename: string): string {
  return `The attached file "${filename}" contains your COMPLETE task as an expert resume writer. Read the ENTIRE file and follow every instruction in it exactly — including the job description, the render/content settings, the candidate source material, the education context, the writing standard, and the output-format contract at the end.

Reply with ONLY the output the file specifies: one JSON resume object wrapped exactly between a line reading ---JSON-START--- and a line reading ---JSON-END---. Do not write any analysis, headings, prose, or markdown outside those two delimiter lines.`;
}

export function buildCouncilJudgeCoverPrompt(filename: string): string {
  return `The attached file "${filename}" contains your COMPLETE task as the impartial JUDGE on a resume-evaluation panel. Read the ENTIRE file and follow every instruction in it exactly — including the job description, rubric, candidate resumes, and the output-format contract at the end.

Reply with ONLY the output the file specifies: one JSON object wrapped exactly between a line reading ---JSON-START--- and a line reading ---JSON-END---, with the top-level keys "scores", "synthesisNotes", and "final". Do not write any analysis, headings, prose, or markdown outside those two delimiter lines.`;
}

export function buildExpandResumePrompt(
  currentResume: ResumeData,
  source: RepositorySource,
  jobDescription?: string,
): string {
  const jdBlock = jobDescription?.trim()
    ? `\nJOB DESCRIPTION (keep tailoring for this role while adding the new item):\n"""\n${jobDescription.trim()}\n"""\n`
    : '';

  const sourcePayload = {
    id: source.id,
    type: source.type,
    title: source.title,
    company: source.company ?? null,
    position: source.position ?? null,
    dates: [source.start_date, source.end_date ?? 'Present']
      .filter(Boolean)
      .join(' – ') || null,
    freewrite: source.freewrite,
  };

  return `You are expanding a resume that currently fits well under one page. Add the item below as a new resume entry.
${jdBlock}
ITEM TO ADD:
\`\`\`json
${JSON.stringify(sourcePayload, null, 2)}
\`\`\`

RULES:
- Add this item to the most appropriate existing section, or create a new section if no suitable one exists.
- Write 2-4 polished resume bullets from the freewrite notes, following the writing standard below.
- Do not invent employers, titles, dates, tools, or metrics not present in the freewrite.
- Experience format: put the employer/company in entry.title; put only the job title in entry.subtitle on the line below. For project entries, leave entry.subtitle empty — never add "Founder", "Co-Founder", "Creator", or any self-assigned title.
- Keep the total resume to one page. If needed, trim 1-2 lower-signal bullets from other entries to make room, but never remove entire entries.
- Preserve all existing section ids, entry ids, link ids, and skill ids exactly. Only generate new stable ids for the new entry, its bullets, and any new section.
- The no-repeat verb rule applies across the WHOLE resume including the bullets already present, so read the existing bullets first and pick leading verbs none of them use.

${RESUME_WRITING_CONTRACT}

${EM_DASH_PROMPT_RULE}

CURRENT RESUME:
\`\`\`json
${JSON.stringify(currentResume, null, 2)}
\`\`\`

${REPOSITORY_RESUME_OUTPUT_RULES}`;
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
