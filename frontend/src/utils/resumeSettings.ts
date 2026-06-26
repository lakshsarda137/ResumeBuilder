import type { ResumeBuildTemplateId } from './resumeBuildStyle';

export type ResumeRenderTemplateId = 'classic' | 'keyword';

export interface ResumeRenderTemplate {
  id: ResumeRenderTemplateId;
  name: string;
  summary: string;
}

export interface ResumeRenderSettings {
  defaultTemplate: ResumeRenderTemplateId;
  sectionHeadings: string[];
  bodyFontFamily: string;
  nameFontFamily: string;
  headingFontFamily: string;
  minBulletsPerExperience: number;
  maxBulletsPerExperience: number;
  nameFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
  bulletFontSize: number;
  lineHeight: number;
  pagePaddingTop: number;
  pagePaddingLeft: number;
  pagePaddingRight: number;
  pagePaddingBottom: number;
  sectionSpacing: number;
  sectionHeaderSpacing: number;
  entrySpacing: number;
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
    id: 'keyword',
    name: 'Keyword emphasis',
    summary: 'Same structure, with selected terms bolded in bullets and skills.',
  },
];

export const DEFAULT_RESUME_RENDER_SETTINGS: ResumeRenderSettings = {
  defaultTemplate: 'classic',
  sectionHeadings: ['Education', 'Experience', 'Projects', 'Technical Skills'],
  bodyFontFamily: 'Times New Roman',
  nameFontFamily: 'Times New Roman',
  headingFontFamily: 'Times New Roman',
  minBulletsPerExperience: 1,
  maxBulletsPerExperience: 3,
  nameFontSize: 22,
  headingFontSize: 11,
  bodyFontSize: 10.5,
  bulletFontSize: 10.5,
  lineHeight: 1.15,
  pagePaddingTop: 0.5,
  pagePaddingLeft: 0.55,
  pagePaddingRight: 0.55,
  pagePaddingBottom: 0.45,
  sectionSpacing: 6,
  sectionHeaderSpacing: 3,
  entrySpacing: 4,
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

function asStringArray(value: unknown, fallback: string[], allowEmpty = false) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned.length > 0 || allowEmpty ? cleaned : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function asInteger(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(asNumber(value, fallback, min, max));
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function mergeResumeRenderSettings(
  value?: Partial<ResumeRenderSettings> | null,
): ResumeRenderSettings {
  const defaults = DEFAULT_RESUME_RENDER_SETTINGS;
  const templateIds = new Set(RESUME_RENDER_TEMPLATES.map((template) => template.id));
  const legacyValue = value as
    | (Partial<ResumeRenderSettings> & { pagePaddingHorizontal?: number })
    | null
    | undefined;
  const legacyHorizontalPadding = legacyValue?.pagePaddingHorizontal;
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
    nameFontFamily:
      typeof value?.nameFontFamily === 'string' && value.nameFontFamily.trim()
        ? value.nameFontFamily.trim()
        : defaults.nameFontFamily,
    headingFontFamily:
      typeof value?.headingFontFamily === 'string' && value.headingFontFamily.trim()
        ? value.headingFontFamily.trim()
        : defaults.headingFontFamily,
    minBulletsPerExperience: asInteger(
      value?.minBulletsPerExperience,
      defaults.minBulletsPerExperience,
      1,
      5,
    ),
    maxBulletsPerExperience: Math.max(
      asInteger(
        value?.maxBulletsPerExperience,
        defaults.maxBulletsPerExperience,
        1,
        6,
      ),
      asInteger(
        value?.minBulletsPerExperience,
        defaults.minBulletsPerExperience,
        1,
        5,
      ),
    ),
    nameFontSize: asNumber(value?.nameFontSize, defaults.nameFontSize, 16, 32),
    headingFontSize: asNumber(value?.headingFontSize, defaults.headingFontSize, 8, 16),
    bodyFontSize: asNumber(value?.bodyFontSize, defaults.bodyFontSize, 8, 14),
    bulletFontSize: asNumber(value?.bulletFontSize, defaults.bulletFontSize, 8, 14),
    lineHeight: asNumber(value?.lineHeight, defaults.lineHeight, 1, 1.6),
    pagePaddingTop: asNumber(value?.pagePaddingTop, defaults.pagePaddingTop, 0.35, 0.8),
    pagePaddingLeft: asNumber(
      value?.pagePaddingLeft ?? legacyHorizontalPadding,
      defaults.pagePaddingLeft,
      0.4,
      0.8,
    ),
    pagePaddingRight: asNumber(
      value?.pagePaddingRight ?? legacyHorizontalPadding,
      defaults.pagePaddingRight,
      0.4,
      0.8,
    ),
    pagePaddingBottom: asNumber(
      value?.pagePaddingBottom,
      defaults.pagePaddingBottom,
      0.35,
      0.8,
    ),
    sectionSpacing: asNumber(value?.sectionSpacing, defaults.sectionSpacing, 3, 10),
    sectionHeaderSpacing: asNumber(
      value?.sectionHeaderSpacing,
      defaults.sectionHeaderSpacing,
      1,
      6,
    ),
    entrySpacing: asNumber(value?.entrySpacing, defaults.entrySpacing, 1, 8),
    sectionHeadingBold: asBoolean(value?.sectionHeadingBold, defaults.sectionHeadingBold),
    sectionHeadingItalic: asBoolean(value?.sectionHeadingItalic, defaults.sectionHeadingItalic),
    sectionHeadingUppercase: asBoolean(value?.sectionHeadingUppercase, defaults.sectionHeadingUppercase),
    entryTitleBold: asBoolean(value?.entryTitleBold, defaults.entryTitleBold),
    entryTitleItalic: asBoolean(value?.entryTitleItalic, defaults.entryTitleItalic),
    subtitleItalic: asBoolean(value?.subtitleItalic, defaults.subtitleItalic),
    dateBold: asBoolean(value?.dateBold, defaults.dateBold),
    dateItalic: asBoolean(value?.dateItalic, defaults.dateItalic),
    skillLabelBold: asBoolean(value?.skillLabelBold, defaults.skillLabelBold),
    keywordTerms: asStringArray(value?.keywordTerms, defaults.keywordTerms, true),
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
  if (templateId === 'keyword') {
    return 'technical';
  }
  return 'jake';
}

export function buildSettingsInstructions(settings: ResumeRenderSettings): string {
  const minBullets = settings.minBulletsPerExperience;
  const maxBullets = Math.max(settings.maxBulletsPerExperience, minBullets);
  const keywordInstruction =
    settings.keywordTerms.length > 0
      ? `Use restrained <strong> tags for genuinely important keywords you choose from the job/source context, with special attention to: ${settings.keywordTerms.join(', ')}. The JSON text itself must contain the <strong> tags; the renderer will not color, highlight, or guess keyword emphasis after generation.`
      : 'Use restrained <strong> tags only for genuinely important keywords you choose from the job/source context. The JSON text itself must contain the <strong> tags; the renderer will not color, highlight, or guess keyword emphasis after generation.';

  return [
    'Hard one page only.',
    `Use these section headings, in this order when supported by source material: ${settings.sectionHeadings.join(', ')}.`,
    'Density contract: if source quality supports it, target 4-5 substantial experience/project entries and 11-13 total experience/project bullets. Do not underfill with only 2-3 entries or fewer than 10 bullets unless the selected source material is genuinely thin or irrelevant.',
    'Use mostly 1-2 bullets per selected entry. Reserve 3 bullets only for the strongest and most job-relevant entry. Prefer adding one more source-supported high-signal bullet over leaving the resume sparse.',
    `Bullet-count contract for selected experience/project entries: use ${minBullets}-${maxBullets} bullet${maxBullets === 1 ? '' : 's'} per entry. This explicit setting overrides generic template guidance. If the resume would not fit one page, omit or merge lower-signal entries instead of exceeding ${maxBullets} bullet${maxBullets === 1 ? '' : 's'} on an entry.`,
    settings.defaultTemplate === 'keyword'
      ? keywordInstruction
      : 'Do not bold arbitrary buzzwords.',
    'Hard layout constraint: never put a tech stack beside an entry name/title. If tools are useful, keep them in the subtitle line below the title or in bullets/skills.',
    'Education convention: keep the degree/major line clean. Put GPA and honors/awards together in their own compact bullet, e.g. "GPA: 3.96/4.00; President\'s Honor Roll (Fall 2025)". Put coursework in a separate "Relevant Coursework:" bullet only when useful.',
    `Renderer style preferences: section headings ${settings.sectionHeadingUppercase ? 'uppercase' : 'title case'}, ${settings.sectionHeadingBold ? 'bold' : 'not bold'}, ${settings.sectionHeadingItalic ? 'italic' : 'not italic'}; entry titles ${settings.entryTitleBold ? 'bold' : 'not bold'}, ${settings.entryTitleItalic ? 'italic' : 'not italic'}; subtitles ${settings.subtitleItalic ? 'italic' : 'not italic'}; dates ${settings.dateBold ? 'bold' : 'not bold'}, ${settings.dateItalic ? 'italic' : 'not italic'}; skill labels ${settings.skillLabelBold ? 'bold' : 'not bold'}.`,
    settings.specialInstructions.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
