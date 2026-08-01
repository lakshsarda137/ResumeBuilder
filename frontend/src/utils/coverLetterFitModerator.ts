import { SAFE_FILL_RATIO, type ResumePageFit } from './pdf';
import {
  mergeCoverLetterRenderSettings,
  type CoverLetterRenderSettings,
} from './coverLetterSettings';

export const SMALL_OVERFLOW_LIMIT = 1.05;

export interface CoverLetterFitModerationResult {
  settings: CoverLetterRenderSettings;
  changed: boolean;
  message: string;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function lower(value: number, amount: number, floor: number) {
  return Math.max(floor, value - amount);
}

function changedSettings(a: CoverLetterRenderSettings, b: CoverLetterRenderSettings) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function canModerateSmallOverflow(fit: ResumePageFit | null) {
  return Boolean(
    fit && fit.status === 'over' && fit.usageRatio > 1 && fit.usageRatio <= SMALL_OVERFLOW_LIMIT,
  );
}

export function shouldSafetyCompress(fit: ResumePageFit | null) {
  return Boolean(
    fit && fit.usageRatio > SAFE_FILL_RATIO && fit.usageRatio <= SMALL_OVERFLOW_LIMIT,
  );
}

/**
 * explicit=true is the user-triggered "Fit small overflow" button (full deltas
 * in one shot); explicit=false is the iterative download-time safety net.
 */
export function buildCoverLetterSmallOverflowFitSettings(
  settings: CoverLetterRenderSettings,
  fit: ResumePageFit,
  explicit = false,
): CoverLetterFitModerationResult {
  if (!shouldSafetyCompress(fit)) {
    return {
      settings,
      changed: false,
      message: 'Auto-fit only applies to letters between the safe fill line and 105% page usage.',
    };
  }

  if (explicit) {
    const next = mergeCoverLetterRenderSettings({
      ...settings,
      pagePaddingTop: round(lower(settings.pagePaddingTop, 0.05, 0.4), 2),
      pagePaddingLeft: round(lower(settings.pagePaddingLeft, 0.06, 0.4), 2),
      pagePaddingRight: round(lower(settings.pagePaddingRight, 0.06, 0.4), 2),
      pagePaddingBottom: round(lower(settings.pagePaddingBottom, 0.05, 0.4), 2),
      paragraphSpacing: round(lower(settings.paragraphSpacing, 3, 4), 1),
      headerSpacing: round(lower(settings.headerSpacing, 4, 6), 1),
      lineHeight: round(lower(settings.lineHeight, 0.05, 1.05), 3),
      bodyFontSize: round(lower(settings.bodyFontSize, 0.25, 9.5), 2),
    });
    return {
      settings: next,
      changed: changedSettings(settings, next),
      message: changedSettings(settings, next)
        ? 'Applied tight fit: spacing compressed, padding widened, font slightly reduced.'
        : 'Already at minimum — nothing left to compress.',
    };
  }

  const severe = fit.usageRatio > 1.025;
  const next = mergeCoverLetterRenderSettings({
    ...settings,
    pagePaddingTop: round(lower(settings.pagePaddingTop, severe ? 0.04 : 0.02, 0.4), 2),
    pagePaddingLeft: round(lower(settings.pagePaddingLeft, severe ? 0.05 : 0.03, 0.4), 2),
    pagePaddingRight: round(lower(settings.pagePaddingRight, severe ? 0.05 : 0.03, 0.4), 2),
    pagePaddingBottom: round(lower(settings.pagePaddingBottom, severe ? 0.04 : 0.02, 0.4), 2),
    paragraphSpacing: round(lower(settings.paragraphSpacing, severe ? 2 : 1, 4), 1),
    headerSpacing: round(lower(settings.headerSpacing, severe ? 3 : 1.5, 6), 1),
    lineHeight: round(lower(settings.lineHeight, severe ? 0.04 : 0.02, 1.05), 3),
    bodyFontSize: severe ? round(lower(settings.bodyFontSize, 0.15, 9.75), 2) : settings.bodyFontSize,
  });

  return {
    settings: next,
    changed: changedSettings(settings, next),
    message: severe
      ? 'Applied tight fit: wider usable width, tighter spacing, and a tiny font reduction.'
      : 'Applied light fit: wider usable width and tighter spacing.',
  };
}
