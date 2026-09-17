import type { ResumeBuildTemplateId } from './resumeBuildStyle';
import { PERSONAL } from '../personal';

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
  bulletIndent: number;
  bodyTextWeight: number;
  boldTextWeight: number;
  strongTextWeight: number;
  textIntensity: number;
  ruleIntensity: number;
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
  /** Render the name + contact line at the top. Off hides it and pulls sections up. */
  showHeader: boolean;
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
    name: 'Technical',
    summary:
      'Same structure, with a technical keyword-forward build template.',
  },
];

export const DEFAULT_RESUME_RENDER_SETTINGS: ResumeRenderSettings = {
  defaultTemplate: 'classic',
  sectionHeadings: ['Education', 'Experience', 'Projects', 'Technical Skills'],
  bodyFontFamily: 'Times New Roman',
  nameFontFamily: 'Times New Roman',
  headingFontFamily: 'Times New Roman',
  minBulletsPerExperience: 2,
  maxBulletsPerExperience: 4,
  nameFontSize: 22,
  headingFontSize: 11,
  bodyFontSize: 10.5,
  bulletFontSize: 10.5,
  bulletIndent: 8.5,
  bodyTextWeight: 400,
  boldTextWeight: 650,
  strongTextWeight: 700,
  textIntensity: 88,
  ruleIntensity: 78,
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
  dateBold: false,
  dateItalic: true,
  skillLabelBold: false,
  showHeader: true,
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
    bulletIndent: asNumber(value?.bulletIndent, defaults.bulletIndent, 5, 16),
    bodyTextWeight: asInteger(value?.bodyTextWeight, defaults.bodyTextWeight, 300, 500),
    boldTextWeight: asInteger(value?.boldTextWeight, defaults.boldTextWeight, 500, 800),
    strongTextWeight: asInteger(value?.strongTextWeight, defaults.strongTextWeight, 500, 800),
    textIntensity: asInteger(value?.textIntensity, defaults.textIntensity, 65, 100),
    ruleIntensity: asInteger(value?.ruleIntensity, defaults.ruleIntensity, 45, 100),
    lineHeight: asNumber(value?.lineHeight, defaults.lineHeight, 1, 1.6),
    pagePaddingTop: asNumber(value?.pagePaddingTop, defaults.pagePaddingTop, 0.35, 0.8),
    pagePaddingLeft: asNumber(
      value?.pagePaddingLeft ?? legacyHorizontalPadding,
      defaults.pagePaddingLeft,
      0.3,
      0.8,
    ),
    pagePaddingRight: asNumber(
      value?.pagePaddingRight ?? legacyHorizontalPadding,
      defaults.pagePaddingRight,
      0.3,
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
    showHeader: asBoolean(value?.showHeader, defaults.showHeader),
    specialInstructions:
      typeof value?.specialInstructions === 'string'
        ? value.specialInstructions
        : defaults.specialInstructions,
  };
}

/**
 * Bumped when a shipped default changes in a way that must reach existing
 * users. Without this, a saved settings blob keeps the old bullet range forever
 * and the new defaults only ever apply to fresh installs. Only the fields
 * listed in MIGRATED_FIELDS are reset; everything the user tuned is preserved.
 */
const SETTINGS_VERSION = 3;
const MIGRATED_FIELDS = [
  'minBulletsPerExperience',
  'maxBulletsPerExperience',
] as const;

export function loadResumeRenderSettings(): ResumeRenderSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_RESUME_RENDER_SETTINGS;
    }
    const parsed = JSON.parse(stored) as Partial<ResumeRenderSettings> & {
      settingsVersion?: number;
    };
    if (parsed.settingsVersion !== SETTINGS_VERSION) {
      for (const field of MIGRATED_FIELDS) {
        delete parsed[field];
      }
      const migrated = mergeResumeRenderSettings(parsed);
      saveResumeRenderSettings(migrated);
      return migrated;
    }
    return mergeResumeRenderSettings(parsed);
  } catch {
    return DEFAULT_RESUME_RENDER_SETTINGS;
  }
}

export function saveResumeRenderSettings(settings: ResumeRenderSettings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...mergeResumeRenderSettings(settings),
        settingsVersion: SETTINGS_VERSION,
      }),
    );
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

export interface SettingsInstructionOptions {
  /**
   * Entry-count targets ("4-5 substantial entries") only make sense when the
   * model is choosing entries from the repository. The optimize path tailors a
   * resume that already has its own structure, so imposing a count there could
   * force it to delete real entries the candidate had.
   */
  includeEntryCountDensity?: boolean;
}

export function buildSettingsInstructions(
  settings: ResumeRenderSettings,
  options: SettingsInstructionOptions = {},
): string {
  const { includeEntryCountDensity = true } = options;
  const minBullets = settings.minBulletsPerExperience;
  const maxBullets = Math.max(settings.maxBulletsPerExperience, minBullets);

  // This block is the SINGLE authority for page limit, section order, entry
  // density, bullet counts, and renderer style. Templates and the build prompt
  // deliberately no longer restate any of it.
  return [
    'Hard one page only. If the resume would spill, drop a lower-signal ENTRY rather than thinning every entry down to its minimum bullet count.',
    `Use these section headings, in this order when supported by source material: ${settings.sectionHeadings.join(', ')}.`,
    includeEntryCountDensity
      ? 'Entry density: target 4-5 substantial experience/project entries when the source supports it. Do not underfill with only 2-3 entries unless the selected source material is genuinely thin or irrelevant.'
      : '',
    `Bullet count per selected experience/project entry: ${minBullets}-${maxBullets} bullet${maxBullets === 1 ? '' : 's'}. Give the strongest, most job-relevant entries the higher counts and weaker entries the lower ones. This is the only bullet-count instruction that applies; ignore any other count you may infer.`,
    `Education convention: keep the degree/major line clean. Three compact bullets at most, in this order: (1) GPA and honors/awards together, e.g. "${PERSONAL.promptExamples.educationHonors}"; (2) "Relevant Coursework:" with YOU choosing the courses most relevant to this job description so the bullet fits on one line, dropping the rest; (3) involvement recorded in the education notes (teaching assistant roles, teams, clubs, organizations) as one line, e.g. "${PERSONAL.promptExamples.educationInvolvement}". Never spread these across more lines than that.`,
    `Renderer style preferences: section headings ${settings.sectionHeadingUppercase ? 'uppercase' : 'title case'}, ${settings.sectionHeadingBold ? `bold around ${settings.boldTextWeight}` : 'not bold'}, ${settings.sectionHeadingItalic ? 'italic' : 'not italic'}; entry titles ${settings.entryTitleBold ? `bold around ${settings.boldTextWeight}` : 'not bold'}, ${settings.entryTitleItalic ? 'italic' : 'not italic'}; subtitles ${settings.subtitleItalic ? 'italic' : 'not italic'}; dates ${settings.dateBold ? `bold around ${settings.boldTextWeight}` : 'not bold'}, ${settings.dateItalic ? 'italic' : 'not italic'}; skill labels ${settings.skillLabelBold ? `bold around ${settings.boldTextWeight}` : 'not bold'}; overall PDF ink intensity ${settings.textIntensity}%.`,
    settings.specialInstructions.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
