import type { ResumeBuildTemplateId } from './resumeBuildStyle';

export type ResumeRenderTemplateId = 'classic' | 'stack' | 'keyword';

export interface ResumeRenderTemplate {
  id: ResumeRenderTemplateId;
  name: string;
  summary: string;
}

export interface ResumeRenderSettings {
  defaultTemplate: ResumeRenderTemplateId;
  sectionHeadings: string[];
  bodyFontFamily: string;
  headingFontFamily: string;
  nameFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
  bulletFontSize: number;
  lineHeight: number;
  sectionHeadingBold: boolean;
  sectionHeadingItalic: boolean;
  sectionHeadingUppercase: boolean;
  entryTitleBold: boolean;
  entryTitleItalic: boolean;
  subtitleItalic: boolean;
  dateBold: boolean;
  dateItalic: boolean;
  skillLabelBold: boolean;
  keywordTerms: string[];
  specialInstructions: string;
}

const STORAGE_KEY = 'resume-render-settings';

export const RESUME_RENDER_TEMPLATES: ResumeRenderTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    summary: 'Screenshot-style one-page serif resume with clean rules and dense bullets.',
  },
  {
    id: 'stack',
    name: 'Stack beside names',
    summary: 'Same structure, but tech stacks are surfaced beside project and role names.',
  },
  {
    id: 'keyword',
    name: 'Keyword emphasis',
    summary: 'Same structure, with selected terms bolded in bullets and skills.',
  },
];

export const DEFAULT_RESUME_RENDER_SETTINGS: ResumeRenderSettings = {
  defaultTemplate: 'classic',
  sectionHeadings: ['Education', 'Experience', 'Projects', 'Technical Skills'],
  bodyFontFamily: 'Times New Roman',
  headingFontFamily: 'Times New Roman',
  nameFontSize: 22,
  headingFontSize: 11,
  bodyFontSize: 10.5,
  bulletFontSize: 10.5,
  lineHeight: 1.15,
  sectionHeadingBold: true,
  sectionHeadingItalic: false,
  sectionHeadingUppercase: true,
  entryTitleBold: true,
  entryTitleItalic: true,
  subtitleItalic: true,
  dateBold: true,
  dateItalic: true,
  skillLabelBold: true,
  keywordTerms: ['Python', 'React', 'SQL', 'Docker', 'AWS', 'LLM', 'API'],
  specialInstructions: [
    'Hard one page only.',
    'Do not include entries with thin source detail.',
    'Do not put product/project URLs in the contact header.',
  ].join('\n'),
};

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function mergeResumeRenderSettings(
  value?: Partial<ResumeRenderSettings> | null,
): ResumeRenderSettings {
  const defaults = DEFAULT_RESUME_RENDER_SETTINGS;
  const templateIds = new Set(RESUME_RENDER_TEMPLATES.map((template) => template.id));
  return {
    defaultTemplate:
      value?.defaultTemplate && templateIds.has(value.defaultTemplate)
        ? value.defaultTemplate
        : defaults.defaultTemplate,
    sectionHeadings: asStringArray(value?.sectionHeadings, defaults.sectionHeadings),
    bodyFontFamily:
      typeof value?.bodyFontFamily === 'string' && value.bodyFontFamily.trim()
        ? value.bodyFontFamily.trim()
        : defaults.bodyFontFamily,
    headingFontFamily:
      typeof value?.headingFontFamily === 'string' && value.headingFontFamily.trim()
        ? value.headingFontFamily.trim()
        : defaults.headingFontFamily,
    nameFontSize: asNumber(value?.nameFontSize, defaults.nameFontSize, 16, 32),
    headingFontSize: asNumber(value?.headingFontSize, defaults.headingFontSize, 8, 16),
    bodyFontSize: asNumber(value?.bodyFontSize, defaults.bodyFontSize, 8, 14),
    bulletFontSize: asNumber(value?.bulletFontSize, defaults.bulletFontSize, 8, 14),
    lineHeight: asNumber(value?.lineHeight, defaults.lineHeight, 1, 1.6),
    sectionHeadingBold: asBoolean(value?.sectionHeadingBold, defaults.sectionHeadingBold),
    sectionHeadingItalic: asBoolean(value?.sectionHeadingItalic, defaults.sectionHeadingItalic),
    sectionHeadingUppercase: asBoolean(value?.sectionHeadingUppercase, defaults.sectionHeadingUppercase),
    entryTitleBold: asBoolean(value?.entryTitleBold, defaults.entryTitleBold),
    entryTitleItalic: asBoolean(value?.entryTitleItalic, defaults.entryTitleItalic),
    subtitleItalic: asBoolean(value?.subtitleItalic, defaults.subtitleItalic),
    dateBold: asBoolean(value?.dateBold, defaults.dateBold),
    dateItalic: asBoolean(value?.dateItalic, defaults.dateItalic),
    skillLabelBold: asBoolean(value?.skillLabelBold, defaults.skillLabelBold),
    keywordTerms: asStringArray(value?.keywordTerms, defaults.keywordTerms),
    specialInstructions:
      typeof value?.specialInstructions === 'string'
        ? value.specialInstructions
        : defaults.specialInstructions,
  };
}

export function loadResumeRenderSettings(): ResumeRenderSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_RESUME_RENDER_SETTINGS;
    }
    return mergeResumeRenderSettings(JSON.parse(stored));
  } catch {
    return DEFAULT_RESUME_RENDER_SETTINGS;
  }
}

export function saveResumeRenderSettings(settings: ResumeRenderSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeResumeRenderSettings(settings)));
  } catch {
    // Local persistence is best-effort.
  }
}

export function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function settingsToBuildTemplateId(
  templateId: ResumeRenderTemplateId,
): ResumeBuildTemplateId {
  if (templateId === 'stack' || templateId === 'keyword') {
    return 'technical';
  }
  return 'jake';
}

export function buildSettingsInstructions(settings: ResumeRenderSettings): string {
  return [
    'Hard one page only.',
    `Use these section headings, in this order when supported by source material: ${settings.sectionHeadings.join(', ')}.`,
    settings.defaultTemplate === 'stack'
      ? 'When a project or experience has a real tech stack, put a concise stack after a pipe in the subtitle so the renderer can show it beside the entry name.'
      : null,
    settings.defaultTemplate === 'keyword'
      ? `Use restrained <strong> tags only for genuinely important keywords, especially: ${settings.keywordTerms.join(', ')}.`
      : 'Do not bold arbitrary buzzwords.',
    `Renderer style preferences: section headings ${settings.sectionHeadingUppercase ? 'uppercase' : 'title case'}, ${settings.sectionHeadingBold ? 'bold' : 'not bold'}, ${settings.sectionHeadingItalic ? 'italic' : 'not italic'}; entry titles ${settings.entryTitleBold ? 'bold' : 'not bold'}, ${settings.entryTitleItalic ? 'italic' : 'not italic'}; subtitles ${settings.subtitleItalic ? 'italic' : 'not italic'}; dates ${settings.dateBold ? 'bold' : 'not bold'}, ${settings.dateItalic ? 'italic' : 'not italic'}; skill labels ${settings.skillLabelBold ? 'bold' : 'not bold'}.`,
    settings.specialInstructions.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
