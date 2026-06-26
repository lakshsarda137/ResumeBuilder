#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, 'frontend/src/components/ResumeDocument.css');
const SETTINGS_PATH = path.join(ROOT, 'frontend/src/utils/resumeSettings.ts');

const PT_PER_IN = 72;
const PAGE_WIDTH_IN = 8.5;

// Average glyph width as a fraction of font size for resume-like prose.
// This is intentionally conservative: exact wrapping must still be verified
// in-browser with real fonts and Range.getClientRects().
const FONT_WIDTH_RATIOS = {
  'times new roman': 0.46,
  times: 0.46,
  georgia: 0.49,
  cambria: 0.47,
  garamond: 0.43,
  arial: 0.50,
  helvetica: 0.50,
  calibri: 0.48,
  inter: 0.52,
};

const RESUME_SAMPLE =
  'Engineered React and TypeScript workflows that reduced review latency by 35% across production dashboards.';

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseCssPt(css, selector, property, fallback) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = css.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\}`))?.[0] ?? '';
  const match = block.match(new RegExp(`${property}:\\s*([^;]+);`));
  if (!match) return fallback;
  return toPt(match[1].trim(), fallback);
}

function parseDefaultNumber(settings, key, fallback) {
  const match = settings.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  return match ? Number(match[1]) : fallback;
}

function parseDefaultString(settings, key, fallback) {
  const match = settings.match(new RegExp(`${key}:\\s*'([^']+)'`));
  return match ? match[1] : fallback;
}

function toPt(value, fallback = 0) {
  const match = String(value).trim().match(/^(-?[0-9.]+)(in|pt|px)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'pt';
  if (unit === 'in') return amount * PT_PER_IN;
  if (unit === 'px') return amount * 0.75;
  return amount;
}

function widthRatioForFont(fontFamily) {
  const normalized = fontFamily.toLowerCase();
  for (const [name, ratio] of Object.entries(FONT_WIDTH_RATIOS)) {
    if (normalized.includes(name)) return ratio;
  }
  return 0.48;
}

function estimateChars(lineWidthPt, fontSizePt, fontFamily, widthMultiplier = 1) {
  const avgCharWidthPt = fontSizePt * widthRatioForFont(fontFamily) * widthMultiplier;
  return lineWidthPt / avgCharWidthPt;
}

function formatRange(chars) {
  // Real strings vary a lot by glyph mix and bolding. This shows the usable
  // prose range rather than pretending the estimate is exact.
  return `${Math.floor(chars * 0.92)}-${Math.ceil(chars * 1.08)}`;
}

function main() {
  const css = readFile(CSS_PATH);
  const settings = readFile(SETTINGS_PATH);

  const bodyFont = parseDefaultString(settings, 'bodyFontFamily', 'Times New Roman');
  const bodySize = parseDefaultNumber(settings, 'bodyFontSize', 10.5);
  const bulletSize = parseDefaultNumber(settings, 'bulletFontSize', bodySize);
  const headingSize = parseDefaultNumber(settings, 'headingFontSize', 11);
  const lineHeight = parseDefaultNumber(settings, 'lineHeight', 1.15);
  const pagePaddingTop = parseDefaultNumber(settings, 'pagePaddingTop', 0.5);
  const legacyHorizontalPadding = parseDefaultNumber(settings, 'pagePaddingHorizontal', 0.55);
  const pagePaddingLeft = parseDefaultNumber(settings, 'pagePaddingLeft', legacyHorizontalPadding);
  const pagePaddingRight = parseDefaultNumber(settings, 'pagePaddingRight', legacyHorizontalPadding);
  const pagePaddingBottom = parseDefaultNumber(settings, 'pagePaddingBottom', 0.45);
  const bulletIndent = parseCssPt(css, '.resume-bullet-item', 'padding-left', 12);
  const entryHeaderGap = parseCssPt(css, '.resume-entry-header', 'gap', 8);
  const pageWidthPt = PAGE_WIDTH_IN * PT_PER_IN;
  const contentWidthPt =
    pageWidthPt - (pagePaddingLeft + pagePaddingRight) * PT_PER_IN;
  const bulletTextWidthPt = contentWidthPt - bulletIndent;
  const entryTitleWidthWithDatePt = contentWidthPt - entryHeaderGap - 95;

  const bodyChars = estimateChars(contentWidthPt, bodySize, bodyFont);
  const bulletChars = estimateChars(bulletTextWidthPt, bulletSize, bodyFont);
  const boldBulletChars = estimateChars(bulletTextWidthPt, bulletSize, bodyFont, 1.04);
  const skillChars = estimateChars(contentWidthPt, bodySize, bodyFont, 1.02);
  const entryTitleChars = estimateChars(entryTitleWidthWithDatePt, bodySize, bodyFont, 1.02);

  const oneLineBulletMax = Math.floor(bulletChars * 0.94);
  const denseTwoLineMin = Math.ceil(bulletChars * 1.12);
  const denseTwoLineMax = Math.floor(bulletChars * 1.62);
  const likelyWasteStart = Math.floor(bulletChars * 1.02);

  console.log('Resume line budget estimate');
  console.log('');
  console.log('Current render inputs');
  console.log(`- Page width: ${PAGE_WIDTH_IN}in (${pageWidthPt.toFixed(1)}pt)`);
  console.log(
    `- Page padding: top ${pagePaddingTop}in, right ${pagePaddingRight}in, bottom ${pagePaddingBottom}in, left ${pagePaddingLeft}in`,
  );
  console.log(`- Content width: ${contentWidthPt.toFixed(1)}pt`);
  console.log(`- Bullet text width: ${bulletTextWidthPt.toFixed(1)}pt (${bulletIndent}pt indent)`);
  console.log(`- Body font: ${bodyFont} ${bodySize}pt`);
  console.log(`- Bullet font: ${bodyFont} ${bulletSize}pt`);
  console.log(`- Heading font size: ${headingSize}pt`);
  console.log(`- Line height: ${lineHeight}`);
  console.log('');
  console.log('Estimated characters per rendered line');
  console.log(`- Normal body line: ${bodyChars.toFixed(1)} chars, practical range ${formatRange(bodyChars)}`);
  console.log(`- Bullet text line: ${bulletChars.toFixed(1)} chars, practical range ${formatRange(bulletChars)}`);
  console.log(`- Bullet with bold spans: ${boldBulletChars.toFixed(1)} chars, practical range ${formatRange(boldBulletChars)}`);
  console.log(`- Skills row: ${skillChars.toFixed(1)} chars, practical range ${formatRange(skillChars)}`);
  console.log(`- Entry title line with ~95pt date: ${entryTitleChars.toFixed(1)} chars, practical range ${formatRange(entryTitleChars)}`);
  console.log('');
  console.log('Prompt-friendly density guidance');
  console.log(`- One-line bullet target: <= ${oneLineBulletMax} chars`);
  console.log(`- Dense two-line bullet target: ${denseTwoLineMin}-${denseTwoLineMax} chars`);
  console.log(`- Watch zone: ${likelyWasteStart}-${denseTwoLineMin - 1} chars may create a short second line`);
  console.log('- Treat numbers/tools as high-value: compress surrounding wording before deleting facts.');
  console.log('');
  console.log('Estimator sample');
  console.log(`- Sample length: ${RESUME_SAMPLE.length} chars`);
  console.log(`- Estimated bullet lines: ${Math.ceil(RESUME_SAMPLE.length / bulletChars)}`);
}

main();
