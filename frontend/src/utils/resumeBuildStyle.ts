/**
 * Template profiles hold ONLY what genuinely differs between templates.
 *
 * Everything a template used to restate — page limit, bullet counts, emphasis,
 * company-first layout, tech-stack placement, contact rules — is now owned by a
 * single authority elsewhere, because the assembled prompt was stating the same
 * instruction up to twelve times in slightly different words and in a few cases
 * contradicting itself (templates asked for "editable placeholders" while the
 * build rules banned placeholder text outright).
 *
 * Single authorities:
 * - bullet counts, entry density, page limit, section order, renderer style:
 *   buildSettingsInstructions() in resumeSettings.ts
 * - bullet writing, verbs, length, bold emphasis: resumeWritingRules.ts
 * - layout invariants, contact, truthfulness: the build prompt in aiPrompt.ts
 */
export type ResumeBuildTemplateId = 'jake' | 'compact' | 'technical';

export interface ResumeBuildStyleProfile {
  id: ResumeBuildTemplateId;
  name: string;
  summary: string;
  font: string;
  sectionOrder: string[];
  /** Template-specific selection bias only. */
  selectionRules: string[];
  /** Template-specific visual conventions only. */
  formattingRules: string[];
}

export const RESUME_BUILD_TEMPLATES: ResumeBuildStyleProfile[] = [
  {
    id: 'jake',
    name: 'Jake-style classic',
    summary: 'Dense, clean one-page SWE resume with understated headings.',
    font: 'Times New Roman / LaTeX-style serif, compact 10-10.5pt body.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Prioritize depth over breadth: include only entries with enough source detail for credible bullets.',
      'Projects compete with experience for space; do not stuff every project in.',
    ],
    formattingRules: [
      'Use clean section headings similar to Jake Gutierrez-style resumes.',
      'Use italics for subtitles such as degree, role context, and date/location secondary lines.',
    ],
  },
  {
    id: 'compact',
    name: 'Ultra-compact technical',
    summary: 'Aggressive one-page compression for dense technical histories.',
    font: 'Compact serif, tight body, minimal whitespace.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Include only the highest-signal entries for the target job; drop thin entries even if recent.',
      'Prefer one flagship experience, one supporting experience, and 1-2 projects over broad coverage.',
      'Merge overlapping project details into fewer, stronger bullets.',
    ],
    formattingRules: [
      'Use very compact titles and subtitles.',
      'Use semicolon-separated skill categories where possible.',
      'Stay at the low end of the bold emphasis budget; this density cannot absorb visual noise.',
    ],
  },
  {
    id: 'technical',
    name: 'Technical keyword forward',
    summary: 'One-page resume with restrained technical emphasis and concise subtitles.',
    font: 'Times-style serif, concise technical subtitles.',
    sectionOrder: ['Education', 'Experience', 'Projects', 'Technical Skills'],
    selectionRules: [
      'Select entries with both technical depth and job relevance.',
      'Favor entries whose source material names systems, architecture, tools, metrics, or measurable impact.',
    ],
    formattingRules: [
      'List concise tools in subtitles for experiences/projects when the source supports them.',
      'Keep tool lists short: 4-7 technologies, no padding.',
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
Template: ${profile.name} — ${profile.summary}
Font/layout target: ${profile.font}
Section order: ${profile.sectionOrder.join(' > ')}

Selection bias for this template:
${profile.selectionRules.map((rule) => `- ${rule}`).join('\n')}

Visual conventions for this template:
${profile.formattingRules.map((rule) => `- ${rule}`).join('\n')}

User custom conventions:
${customInstructions.trim() || '- None.'}`;
}
