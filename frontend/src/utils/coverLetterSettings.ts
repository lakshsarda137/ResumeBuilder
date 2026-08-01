import type { ResumeRenderSettings } from './resumeSettings';

export interface CoverLetterRenderSettings {
  bodyFontFamily: string;
  nameFontFamily: string;
  nameFontSize: number;
  bodyFontSize: number;
  bodyTextWeight: number;
  boldTextWeight: number;
  textIntensity: number;
  lineHeight: number;
  pagePaddingTop: number;
  pagePaddingLeft: number;
  pagePaddingRight: number;
  pagePaddingBottom: number;
  paragraphSpacing: number;
  headerSpacing: number;
  dateBold: boolean;
  dateItalic: boolean;
  signatureItalic: boolean;
  specialInstructions: string;
}

export const DEFAULT_COVER_LETTER_RENDER_SETTINGS: CoverLetterRenderSettings = {
  bodyFontFamily: 'Times New Roman',
  nameFontFamily: 'Times New Roman',
  nameFontSize: 20,
  bodyFontSize: 11,
  bodyTextWeight: 400,
  boldTextWeight: 650,
  textIntensity: 88,
  lineHeight: 1.3,
  pagePaddingTop: 0.75,
  pagePaddingLeft: 0.75,
  pagePaddingRight: 0.75,
  pagePaddingBottom: 0.75,
  paragraphSpacing: 12,
  headerSpacing: 18,
  dateBold: false,
  dateItalic: false,
  signatureItalic: false,
  specialInstructions: ['Hard one page only.', 'Keep it to 3-4 body paragraphs.'].join('\n'),
};

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function mergeCoverLetterRenderSettings(
  value?: Partial<CoverLetterRenderSettings> | null,
): CoverLetterRenderSettings {
  const defaults = DEFAULT_COVER_LETTER_RENDER_SETTINGS;
  return {
    bodyFontFamily:
      typeof value?.bodyFontFamily === 'string' && value.bodyFontFamily.trim()
        ? value.bodyFontFamily.trim()
        : defaults.bodyFontFamily,
    nameFontFamily:
      typeof value?.nameFontFamily === 'string' && value.nameFontFamily.trim()
        ? value.nameFontFamily.trim()
        : defaults.nameFontFamily,
    nameFontSize: asNumber(value?.nameFontSize, defaults.nameFontSize, 14, 28),
    bodyFontSize: asNumber(value?.bodyFontSize, defaults.bodyFontSize, 9, 14),
    bodyTextWeight: asNumber(value?.bodyTextWeight, defaults.bodyTextWeight, 300, 500),
    boldTextWeight: asNumber(value?.boldTextWeight, defaults.boldTextWeight, 500, 800),
    textIntensity: asNumber(value?.textIntensity, defaults.textIntensity, 65, 100),
    lineHeight: asNumber(value?.lineHeight, defaults.lineHeight, 1, 1.8),
    pagePaddingTop: asNumber(value?.pagePaddingTop, defaults.pagePaddingTop, 0.4, 1.2),
    pagePaddingLeft: asNumber(value?.pagePaddingLeft, defaults.pagePaddingLeft, 0.4, 1.2),
    pagePaddingRight: asNumber(value?.pagePaddingRight, defaults.pagePaddingRight, 0.4, 1.2),
    pagePaddingBottom: asNumber(value?.pagePaddingBottom, defaults.pagePaddingBottom, 0.4, 1.2),
    paragraphSpacing: asNumber(value?.paragraphSpacing, defaults.paragraphSpacing, 4, 24),
    headerSpacing: asNumber(value?.headerSpacing, defaults.headerSpacing, 6, 36),
    dateBold: asBoolean(value?.dateBold, defaults.dateBold),
    dateItalic: asBoolean(value?.dateItalic, defaults.dateItalic),
    signatureItalic: asBoolean(value?.signatureItalic, defaults.signatureItalic),
    specialInstructions:
      typeof value?.specialInstructions === 'string'
        ? value.specialInstructions
        : defaults.specialInstructions,
  };
}

/**
 * The letter's typography is DERIVED from the resume's, never stored or edited
 * separately. The cover letter guide's first checklist item is "Consistent with
 * your resume, e.g., header, font?", and two independently-tunable settings
 * blobs are a guarantee that the two documents eventually diverge.
 *
 * Three things intentionally do NOT come from the resume:
 * - Horizontal margins match exactly (that is what makes the two headers line
 *   up), but vertical margins get a floor, because a 350-word letter rendered
 *   with a dense resume's 0.5in top margin sits stranded at the top of the page.
 * - Paragraph spacing is fixed. The resume's entry spacing (~4pt) is far too
 *   tight to separate paragraphs of prose.
 * - Line height gets a floor. Running prose needs more leading than a bullet
 *   list, and a one-page letter has the room to spend.
 */
export function deriveCoverLetterRenderSettings(
  resume: ResumeRenderSettings,
): CoverLetterRenderSettings {
  return mergeCoverLetterRenderSettings({
    bodyFontFamily: resume.bodyFontFamily,
    nameFontFamily: resume.nameFontFamily,
    nameFontSize: resume.nameFontSize,
    bodyFontSize: resume.bodyFontSize,
    bodyTextWeight: resume.bodyTextWeight,
    boldTextWeight: resume.boldTextWeight,
    textIntensity: resume.textIntensity,
    lineHeight: Math.max(resume.lineHeight, 1.25),
    pagePaddingTop: Math.max(resume.pagePaddingTop, 0.6),
    pagePaddingLeft: resume.pagePaddingLeft,
    pagePaddingRight: resume.pagePaddingRight,
    pagePaddingBottom: Math.max(resume.pagePaddingBottom, 0.6),
    paragraphSpacing: DEFAULT_COVER_LETTER_RENDER_SETTINGS.paragraphSpacing,
    headerSpacing: DEFAULT_COVER_LETTER_RENDER_SETTINGS.headerSpacing,
    dateBold: false,
    dateItalic: false,
    signatureItalic: false,
    specialInstructions: DEFAULT_COVER_LETTER_RENDER_SETTINGS.specialInstructions,
  });
}

export function buildCoverLetterSettingsInstructions(settings: CoverLetterRenderSettings): string {
  return [
    'Hard one page only.',
    `Renderer style preferences: dates ${settings.dateBold ? `bold around ${settings.boldTextWeight}` : 'not bold'}, ${settings.dateItalic ? 'italic' : 'not italic'}; signature ${settings.signatureItalic ? 'italic' : 'not italic'}; overall PDF ink intensity ${settings.textIntensity}%.`,
    settings.specialInstructions.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}
