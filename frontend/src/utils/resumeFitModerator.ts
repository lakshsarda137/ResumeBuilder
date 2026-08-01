import { SAFE_FILL_RATIO, type ResumePageFit } from './pdf';
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

/**
 * Download-time net: compress not just true overflow, but also "near-full"
 * resumes sitting above the safe fill ratio (e.g. 98–100%), since those still
 * risk spilling a line onto page 2. Anything beyond SMALL_OVERFLOW_LIMIT is too
 * large to fix without harming content and is handled by an explicit warning.
 */
export function shouldSafetyCompress(fit: ResumePageFit | null) {
  return Boolean(
    fit &&
      fit.usageRatio > SAFE_FILL_RATIO &&
      fit.usageRatio <= SMALL_OVERFLOW_LIMIT,
  );
}

/**
 * explicit=true is for the user-triggered "Fit small overflow" button: always
 * applies the full aggressive deltas in one shot so the improvement is visible.
 * explicit=false (default) is for the iterative download-time safety net, which
 * runs in a loop and intentionally uses smaller per-step increments.
 */
export function buildSmallOverflowFitSettings(
  settings: ResumeRenderSettings,
  fit: ResumePageFit,
  explicit = false,
): FitModerationResult {
  if (!shouldSafetyCompress(fit)) {
    return {
      settings,
      changed: false,
      message: 'Auto-fit only applies to resumes between the safe fill line and 105% page usage.',
    };
  }

  if (explicit) {
    // User clicked the button — push all knobs to their limits in one shot.
    const next = mergeResumeRenderSettings({
      ...settings,
      pagePaddingTop:        round(lower(settings.pagePaddingTop,        0.04, 0.40), 2),
      pagePaddingLeft:       round(lower(settings.pagePaddingLeft,        0.06, 0.46), 2),
      pagePaddingRight:      round(lower(settings.pagePaddingRight,       0.06, 0.46), 2),
      pagePaddingBottom:     round(lower(settings.pagePaddingBottom,      0.04, 0.36), 2),
      sectionSpacing:        round(lower(settings.sectionSpacing,         1.5,  4),   1),
      sectionHeaderSpacing:  round(lower(settings.sectionHeaderSpacing,   1.5,  1.5), 1),
      entrySpacing:          round(lower(settings.entrySpacing,           1.5,  2),   1),
      lineHeight:            round(lower(settings.lineHeight,             0.04, 1.10), 3),
      bodyFontSize:          round(lower(settings.bodyFontSize,           0.25, 10.0), 2),
      bulletFontSize:        round(lower(settings.bulletFontSize,         0.25, 10.0), 2),
    });
    return {
      settings: next,
      changed: changedSettings(settings, next),
      message: changedSettings(settings, next)
        ? 'Applied tight fit: spacing compressed, padding widened, font slightly reduced.'
        : 'Already at minimum — nothing left to compress.',
    };
  }

  // Download-time iterative path: small steps, runs in a loop.
  const severe = fit.usageRatio > 1.025;
  const next = mergeResumeRenderSettings({
    ...settings,
    pagePaddingTop:       round(lower(settings.pagePaddingTop,       severe ? 0.03 : 0.02, 0.46), 2),
    pagePaddingLeft:      round(lower(settings.pagePaddingLeft,      severe ? 0.05 : 0.03, 0.5),  2),
    pagePaddingRight:     round(lower(settings.pagePaddingRight,     severe ? 0.05 : 0.03, 0.5),  2),
    pagePaddingBottom:    round(lower(settings.pagePaddingBottom,    severe ? 0.03 : 0.02, 0.4),  2),
    sectionSpacing:       round(lower(settings.sectionSpacing,       severe ? 1    : 0.5,  5),    1),
    sectionHeaderSpacing: round(lower(settings.sectionHeaderSpacing, severe ? 1    : 0.5,  2),    1),
    entrySpacing:         round(lower(settings.entrySpacing,         severe ? 1    : 0.5,  3),    1),
    lineHeight:           round(lower(settings.lineHeight,           severe ? 0.03 : 0.015, 1.12), 3),
    bodyFontSize:    severe ? round(lower(settings.bodyFontSize,    0.15, 10.25), 2) : settings.bodyFontSize,
    bulletFontSize:  severe ? round(lower(settings.bulletFontSize,  0.15, 10.25), 2) : settings.bulletFontSize,
  });

  return {
    settings: next,
    changed: changedSettings(settings, next),
    message: severe
      ? 'Applied tight fit: wider usable width, tighter spacing, and a tiny font reduction.'
      : 'Applied light fit: wider usable width and tighter spacing.',
  };
}
