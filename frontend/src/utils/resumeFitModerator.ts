import type { ResumePageFit } from './pdf';
import {
  mergeResumeRenderSettings,
  type ResumeRenderSettings,
} from './resumeSettings';

export const SMALL_OVERFLOW_LIMIT = 1.05;

export interface FitModerationResult {
  settings: ResumeRenderSettings;
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

function changedSettings(a: ResumeRenderSettings, b: ResumeRenderSettings) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function canModerateSmallOverflow(fit: ResumePageFit | null) {
  return Boolean(
    fit &&
      fit.status === 'over' &&
      fit.usageRatio > 1 &&
      fit.usageRatio <= SMALL_OVERFLOW_LIMIT,
  );
}

export function buildSmallOverflowFitSettings(
  settings: ResumeRenderSettings,
  fit: ResumePageFit,
): FitModerationResult {
  if (!canModerateSmallOverflow(fit)) {
    return {
      settings,
      changed: false,
      message: 'Small-overflow fit is only intended for resumes up to 105% page usage.',
    };
  }

  const severe = fit.usageRatio > 1.025;
  const next = mergeResumeRenderSettings({
    ...settings,
    pagePaddingTop: round(lower(settings.pagePaddingTop, severe ? 0.03 : 0.02, 0.46), 2),
    pagePaddingLeft: round(
      lower(settings.pagePaddingLeft, severe ? 0.05 : 0.03, 0.5),
      2,
    ),
    pagePaddingRight: round(
      lower(settings.pagePaddingRight, severe ? 0.05 : 0.03, 0.5),
      2,
    ),
    pagePaddingBottom: round(
      lower(settings.pagePaddingBottom, severe ? 0.03 : 0.02, 0.4),
      2,
    ),
    sectionSpacing: round(lower(settings.sectionSpacing, severe ? 1 : 0.5, 5), 1),
    sectionHeaderSpacing: round(
      lower(settings.sectionHeaderSpacing, severe ? 1 : 0.5, 2),
      1,
    ),
    entrySpacing: round(lower(settings.entrySpacing, severe ? 1 : 0.5, 3), 1),
    lineHeight: round(lower(settings.lineHeight, severe ? 0.03 : 0.015, 1.12), 3),
    bodyFontSize: severe ? round(lower(settings.bodyFontSize, 0.15, 10.25), 2) : settings.bodyFontSize,
    bulletFontSize: severe
      ? round(lower(settings.bulletFontSize, 0.15, 10.25), 2)
      : settings.bulletFontSize,
  });

  return {
    settings: next,
    changed: changedSettings(settings, next),
    message: severe
      ? 'Applied tight fit: wider usable width, tighter spacing, and a tiny font reduction.'
      : 'Applied light fit: wider usable width and tighter spacing.',
  };
}
