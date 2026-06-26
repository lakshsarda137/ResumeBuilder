export type ResumeBuildTemplateId = 'jake' | 'compact' | 'technical';

export interface ResumeBuildStyleProfile {
  id: ResumeBuildTemplateId;
  name: string;
  summary: string;
  font: string;
  pageBudget: string;
  sectionOrder: string[];
  selectionRules: string[];
  formattingRules: string[];
  contactRules: string[];
}

export const RESUME_BUILD_TEMPLATES: ResumeBuildStyleProfile[] = [
  {
    id: 'jake',
    name: 'Jake-style classic',
    summary: 'Dense, clean one-page SWE resume with understated headings.',
    font: 'Times New Roman / LaTeX-style serif, compact 10-10.5pt body.',
    pageBudget: 'Hard one-page resume. Target 4-5 substantial entries and 11-13 experience/project bullets when source quality supports it. Never underfill with only 2-3 entries unless the source material is genuinely thin.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Prioritize depth over breadth: include only entries with enough source detail for credible bullets.',
      'Do not include weak entries just because they exist in the repository.',
      'If an entry has almost no task/project detail, omit it unless the job description makes it essential.',
      'Use mostly 1-2 bullets per selected entry. Reserve 3 bullets only for the strongest and most job-relevant entry.',
      'Do not leave the resume sparse: if high-signal source material remains and the selected set is under 10 bullets, add another truthful bullet or entry before finalizing.',
      'Projects should compete with experience for space; do not stuff every project into the resume.',
    ],
    formattingRules: [
      'Use clean section headings similar to Jake Gutierrez-style resumes.',
      'Use bold for organization/project names and role titles when helpful.',
      'Use italics for subtitles such as degree, company context, role context, and date/location secondary lines.',
      'Do not bold arbitrary buzzwords by default.',
      'Never place a tech stack beside the entry title/name. If tools matter, keep concise tools in the subtitle line below the title or weave them into bullets/skills.',
      'If using inline emphasis in JSON strings, use only <strong>, <em>, or <span style="font-weight:...;font-style:..."> for heading/keyword conventions; do not output Markdown, <mark>, colors, or background highlights.',
    ],
    contactRules: [
      'Only include contact links explicitly supported by source material.',
      'Never treat a project URL, company URL, demo URL, or product URL as the candidate personal website.',
      'If personal email/phone/GitHub/LinkedIn are missing, use editable placeholders; do not invent real-looking handles.',
    ],
  },
  {
    id: 'compact',
    name: 'Ultra-compact technical',
    summary: 'Aggressive one-page compression for dense technical histories.',
    font: 'Compact serif, tight body, minimal whitespace.',
    pageBudget: 'Hard one-page resume. Use 4-5 entries, 10-13 bullets total, one compact skills section, and terse education.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Include only the highest-signal entries for the target job.',
      'Drop entries with thin source detail even if they are recent.',
      'Prefer one flagship experience, one supporting experience, and 1-2 projects over broad coverage.',
      'Merge overlapping project details into fewer stronger bullets, but keep 1-3 bullets per entry.',
    ],
    formattingRules: [
      'Use very compact titles and subtitles.',
      'Use semicolon-separated skill categories where possible.',
      'Bold only major entry names and skill labels.',
      'Avoid inline keyword bolding unless custom instructions request it.',
      'Avoid long tech-stack subtitles unless they materially improve scanability.',
    ],
    contactRules: [
      'Only include verified personal contact information from source material.',
      'Never promote product/project URLs into the contact header.',
      'Use placeholders for missing personal links.',
    ],
  },
  {
    id: 'technical',
    name: 'Technical keyword forward',
    summary: 'One-page resume with restrained technical emphasis and concise subtitles.',
    font: 'Times-style serif, concise technical subtitles.',
    pageBudget: 'Hard one-page resume. Target 4-5 substantial entries, 11-13 bullets total, and compact technical subtitles when source quality supports it.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Select entries with both technical depth and job relevance.',
      'Do not include entries with only title/date/company and no implementation detail.',
      'Favor entries whose source material names systems, architecture, tools, metrics, or measurable impact.',
      'Limit weaker entries to one bullet or omit them. Use mostly 1-2 bullets per selected entry, reserve 3 only for the strongest entry, and never use 4.',
      'Do not underfill: if high-signal technical material remains and the selected set is under 10 bullets, include another truthful bullet or entry before finalizing.',
    ],
    formattingRules: [
      'List concise tools in subtitles for experiences/projects only when the source supports them; the subtitle must stay on the line below the title.',
      'Keep tool lists short: 4-7 technologies, no padding.',
      'Never place a tech stack beside the entry title/name.',
      'Allow the LLM to bold the most important 1-3 technical keywords per section if useful.',
      'Use <strong> for selected keywords, <em> for subtitles/date-style context, and restricted <span style="font-weight:...;font-style:..."> only when custom conventions require heading/label styling; do not output Markdown, <mark>, colors, or background highlights.',
      'Never let keyword bolding make the resume noisy.',
    ],
    contactRules: [
      'Only include candidate-owned links in contact.',
      'Project/product URLs may appear only inside the relevant project bullet if useful.',
      'Do not infer a personal website from a startup, app, school project, or demo domain.',
    ],
  },
];

export const DEFAULT_RESUME_BUILD_TEMPLATE_ID: ResumeBuildTemplateId = 'jake';

export function getResumeBuildTemplate(id: string): ResumeBuildStyleProfile {
  return (
    RESUME_BUILD_TEMPLATES.find((template) => template.id === id) ??
    RESUME_BUILD_TEMPLATES[0]
  );
}

export function buildResumeStyleInstructions(
  profile: ResumeBuildStyleProfile,
  customInstructions: string,
): string {
  return `RESUME FORMAT PROFILE:
Template: ${profile.name}
Summary: ${profile.summary}
Font/layout target: ${profile.font}
Page budget: ${profile.pageBudget}
Section order: ${profile.sectionOrder.join(' > ')}

Selection rules:
${profile.selectionRules.map((rule) => `- ${rule}`).join('\n')}

Formatting conventions:
${profile.formattingRules.map((rule) => `- ${rule}`).join('\n')}

Contact/link rules:
${profile.contactRules.map((rule) => `- ${rule}`).join('\n')}

User custom conventions:
${customInstructions.trim() || '- None.'}`;
}
