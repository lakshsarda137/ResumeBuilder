const PDF_WIDTH_PT = 612;
const PDF_HEIGHT_PT = 792;

type FontStyleKey = 'regular' | 'bold' | 'italic' | 'boldItalic';
type PdfFontKey =
  | 'timesRegular'
  | 'timesBold'
  | 'timesItalic'
  | 'timesBoldItalic'
  | 'helveticaRegular'
  | 'helveticaBold'
  | 'helveticaItalic'
  | 'helveticaBoldItalic';

interface PdfColor {
  r: number;
  g: number;
  b: number;
}

export interface ResumePageFit {
  status: 'under' | 'fit' | 'over';
  usageRatio: number;
  usedHeightPt: number;
  pageHeightPt: number;
  overflowPt: number;
}

interface TextRun {
  text: string;
  x: number;
  y: number;
  size: number;
  font: PdfFontKey;
  width: number;
  charSpacing: number;
  color: PdfColor;
  strokeWidth: number;
  strokeColor: PdfColor;
}

interface RuleRun {
  x1: number;
  x2: number;
  y: number;
  width: number;
  color: PdfColor;
}

interface CaptureState {
  wrapper: HTMLElement;
  container: HTMLElement | null;
  wrapperStyle: string;
  containerStyle: string;
}

const WIN_ANSI: Record<string, number> = {
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '…': 0x85,
  '€': 0x80,
  '™': 0x99,
  '©': 0xa9,
  '®': 0xae,
  '°': 0xb0,
  '·': 0xb7,
  '×': 0xd7,
};

const DEFAULT_PDF_COLOR: PdfColor = { r: 0, g: 0, b: 0 };

export async function waitForLayout() {
  await document.fonts.ready;
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function getExportWrapper(elementId: string) {
  const wrapper = document.getElementById(elementId)?.closest(
    '.resume-page-wrapper',
  ) as HTMLElement | null;

  if (!wrapper) {
    throw new Error('Resume element not found');
  }

  return wrapper;
}

function getResumePage(wrapper: HTMLElement) {
  const page = wrapper.querySelector('.resume-page') as HTMLElement | null;
  if (!page) {
    throw new Error('Resume page not found');
  }
  return page;
}

function beginCapture(elementId: string): CaptureState {
  const wrapper = getExportWrapper(elementId);
  const container = wrapper.parentElement;

  wrapper.classList.add('export-mode');

  const state: CaptureState = {
    wrapper,
    container,
    wrapperStyle: wrapper.style.cssText,
    containerStyle: container?.style.cssText ?? '',
  };

  if (container) {
    container.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:8.5in',
      'height:auto',
      'overflow:visible',
      'z-index:2147483647',
      'pointer-events:none',
      'background:#ffffff',
    ].join(';');
  }

  wrapper.style.cssText = [
    'position:relative',
    'margin:0',
    'opacity:1',
    'visibility:visible',
    'transform:none',
  ].join(';');

  return state;
}

function endCapture(state: CaptureState) {
  state.wrapper.classList.remove('export-mode');
  state.wrapper.style.cssText = state.wrapperStyle;
  if (state.container) {
    state.container.style.cssText = state.containerStyle;
  }
}

function isVisibleElement(element: Element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function fontStyleKeyFor(style: CSSStyleDeclaration): FontStyleKey {
  const isItalic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
  const weight = Number.parseFloat(style.fontWeight);
  // Treat 600+ as bold so the PDF picks the real bold font face (Times-Bold,
  // Helvetica-Bold, etc.) instead of faking weight with a synthetic stroke.
  // This mirrors how the browser preview resolves font-weight to a real face.
  const isBold = Number.isFinite(weight) ? weight >= 600 : false;

  if (isBold && isItalic) return 'boldItalic';
  if (isBold) return 'bold';
  if (isItalic) return 'italic';
  return 'regular';
}

function pdfFontKeyFor(style: CSSStyleDeclaration): PdfFontKey {
  const fontFamily = style.fontFamily.toLowerCase();
  const family = (
    fontFamily.includes('arial') ||
    fontFamily.includes('calibri') ||
    fontFamily.includes('helvetica') ||
    fontFamily.includes('inter') ||
    fontFamily.includes('sans')
  )
    ? 'helvetica'
    : 'times';
  const variant = fontStyleKeyFor(style);

  if (family === 'helvetica') {
    if (variant === 'boldItalic') return 'helveticaBoldItalic';
    if (variant === 'bold') return 'helveticaBold';
    if (variant === 'italic') return 'helveticaItalic';
    return 'helveticaRegular';
  }

  if (variant === 'boldItalic') return 'timesBoldItalic';
  if (variant === 'bold') return 'timesBold';
  if (variant === 'italic') return 'timesItalic';
  return 'timesRegular';
}

function textByte(char: string) {
  const code = char.codePointAt(0) ?? 0x20;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return WIN_ANSI[char] ?? 0x3f;
}

function pdfString(value: string) {
  let result = '(';
  for (const char of value) {
    const byte = textByte(char);
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) {
      result += `\\${String.fromCharCode(byte)}`;
    } else if (byte < 0x20 || byte > 0x7e) {
      result += `\\${byte.toString(8).padStart(3, '0')}`;
    } else {
      result += String.fromCharCode(byte);
    }
  }
  return `${result})`;
}

function pdfNumber(value: number) {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0';
}

function pdfColor(color: PdfColor) {
  return `${pdfNumber(color.r)} ${pdfNumber(color.g)} ${pdfNumber(color.b)}`;
}

function parseCssColor(value: string): PdfColor {
  const match = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (!match) {
    return DEFAULT_PDF_COLOR;
  }

  const alpha = Math.min(1, Math.max(0, Number(match[4] ?? 1)));
  const blend = (channel: string) => {
    const value255 = Math.min(255, Math.max(0, Number(channel)));
    return (value255 * alpha + 255 * (1 - alpha)) / 255;
  };

  return {
    r: blend(match[1]),
    g: blend(match[2]),
    b: blend(match[3]),
  };
}

function cssLengthToPt(value: string, scale: number) {
  if (!value || value === 'normal') {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed * scale : 0;
}

function textStrokeWidthFor(style: CSSStyleDeclaration, scale: number) {
  return cssLengthToPt(
    style.getPropertyValue('-webkit-text-stroke-width'),
    scale,
  );
}

function textStrokeColorFor(style: CSSStyleDeclaration) {
  return parseCssColor(
    style.getPropertyValue('-webkit-text-stroke-color') || style.color,
  );
}

function applyTextTransform(text: string, transform: string) {
  if (transform === 'uppercase') {
    return text.toUpperCase();
  }
  if (transform === 'lowercase') {
    return text.toLowerCase();
  }
  if (transform === 'capitalize') {
    return text.replace(/\b[a-z]/gi, (char) => char.toUpperCase());
  }
  return text;
}

function walkTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent || !isVisibleElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest('.resume-control')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

function addTextNodeRuns(
  node: Text,
  pageRect: DOMRect,
  scale: number,
  runs: TextRun[],
) {
  const text = node.textContent ?? '';
  const parent = node.parentElement;
  if (!parent) return;

  const style = window.getComputedStyle(parent);
  const font = pdfFontKeyFor(style);
  const size = Number.parseFloat(style.fontSize) * scale;
  const charSpacing = cssLengthToPt(style.letterSpacing, scale);
  const color = parseCssColor(style.color);
  const strokeWidth = textStrokeWidthFor(style, scale);
  const strokeColor = textStrokeColorFor(style);

  const lineGroups: Array<{
    top: number;
    bottom: number;
    left: number;
    right: number;
    start: number;
    end: number;
  }> = [];

  for (let index = 0; index < text.length; index += 1) {
    if (!text[index].trim()) continue;

    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);

    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width <= 0 || rect.height <= 0) continue;

      const group = lineGroups.find(
        (line) =>
          Math.abs(line.bottom - rect.bottom) <= 1.5 &&
          Math.abs(line.top - rect.top) <= 1.5,
      );

      if (group) {
        group.left = Math.min(group.left, rect.left);
        group.right = Math.max(group.right, rect.right);
        group.start = Math.min(group.start, index);
        group.end = Math.max(group.end, index + 1);
      } else {
        lineGroups.push({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          start: index,
          end: index + 1,
        });
      }
    }

    range.detach();
  }

  for (const group of lineGroups) {
    const chunk = applyTextTransform(
      text.slice(group.start, group.end).replace(/\s+/g, ' ').trim(),
      style.textTransform,
    );
    if (!chunk) continue;

    const x = (group.left - pageRect.left) * scale;
    const y = PDF_HEIGHT_PT - (group.bottom - pageRect.top) * scale + size * 0.18;

    if (x < -1 || x > PDF_WIDTH_PT + 1 || y < -1 || y > PDF_HEIGHT_PT + 1) {
      continue;
    }

    runs.push({
      text: chunk,
      x,
      y,
      size,
      font,
      width: (group.right - group.left) * scale,
      charSpacing,
      color,
      strokeWidth,
      strokeColor,
    });
  }
}

function addBulletRuns(page: HTMLElement, pageRect: DOMRect, scale: number, runs: TextRun[]) {
  page.querySelectorAll<HTMLElement>('.resume-bullet-item').forEach((item) => {
    if (!isVisibleElement(item)) return;

    const before = window.getComputedStyle(item, '::before');
    const content = before.content.replace(/^["']|["']$/g, '');
    if (!content || content === 'none') return;

    const rect = item.getBoundingClientRect();
    const size = Number.parseFloat(before.fontSize || window.getComputedStyle(item).fontSize) * scale;
    const strokeWidth = textStrokeWidthFor(before, scale);
    runs.push({
      text: content,
      x: (rect.left - pageRect.left) * scale,
      y: PDF_HEIGHT_PT - (rect.top - pageRect.top) * scale - size * 0.82,
      size,
      font: pdfFontKeyFor(before),
      width: size * 0.4,
      charSpacing: cssLengthToPt(before.letterSpacing, scale),
      color: parseCssColor(before.color),
      strokeWidth,
      strokeColor: textStrokeColorFor(before),
    });
  });
}

function addExtractionSpaces(runs: TextRun[]) {
  const spacedRuns: TextRun[] = [];
  let previous: TextRun | null = null;

  for (const run of runs) {
    const sameLine = previous ? Math.abs(previous.y - run.y) <= 1.5 : false;
    const gap = previous && sameLine ? run.x - (previous.x + previous.width) : 0;

    if (previous && gap > Math.max(0.8, run.size * 0.08)) {
      spacedRuns.push({
        text: ' ',
        x: previous.x + previous.width + gap / 2,
        y: run.y,
        size: run.size,
        font: previous.font,
        width: Math.min(gap, run.size * 0.35),
        charSpacing: 0,
        color: previous.color,
        strokeWidth: 0,
        strokeColor: previous.strokeColor,
      });
    }

    spacedRuns.push(run);
    previous = run;
  }

  return spacedRuns;
}

function collectTextRuns(page: HTMLElement) {
  const pageRect = page.getBoundingClientRect();
  const scale = PDF_WIDTH_PT / pageRect.width;
  const runs: TextRun[] = [];

  for (const node of walkTextNodes(page)) {
    addTextNodeRuns(node, pageRect, scale, runs);
  }
  addBulletRuns(page, pageRect, scale, runs);

  const sortedRuns = runs.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 1.5) return b.y - a.y;
    return a.x - b.x;
  });

  return addExtractionSpaces(sortedRuns);
}

function collectRules(page: HTMLElement) {
  const pageRect = page.getBoundingClientRect();
  const scale = PDF_WIDTH_PT / pageRect.width;
  const rules: RuleRun[] = [];

  page.querySelectorAll<HTMLElement>('.resume-section-header').forEach((header) => {
    if (!isVisibleElement(header)) return;
    const style = window.getComputedStyle(header);
    const borderWidth = Number.parseFloat(style.borderBottomWidth);
    if (!borderWidth) return;

    const rect = header.getBoundingClientRect();
    rules.push({
      x1: (rect.left - pageRect.left) * scale,
      x2: (rect.right - pageRect.left) * scale,
      y: PDF_HEIGHT_PT - (rect.bottom - pageRect.top) * scale + (borderWidth * scale) / 2,
      width: borderWidth * scale,
      color: parseCssColor(style.borderBottomColor),
    });
  });

  return rules;
}

function buildContentStream(textRuns: TextRun[], rules: RuleRun[]) {
  const fontNames: Record<PdfFontKey, string> = {
    timesRegular: 'F1',
    timesBold: 'F2',
    timesItalic: 'F3',
    timesBoldItalic: 'F4',
    helveticaRegular: 'F5',
    helveticaBold: 'F6',
    helveticaItalic: 'F7',
    helveticaBoldItalic: 'F8',
  };

  const lines = [
    'q',
    '1 1 1 rg',
    `0 0 ${PDF_WIDTH_PT} ${PDF_HEIGHT_PT} re f`,
    '0 0 0 RG',
    '0 0 0 rg',
  ];

  for (const rule of rules) {
    lines.push(
      `${pdfColor(rule.color)} RG`,
      `${pdfNumber(rule.width)} w`,
      `${pdfNumber(rule.x1)} ${pdfNumber(rule.y)} m`,
      `${pdfNumber(rule.x2)} ${pdfNumber(rule.y)} l`,
      'S',
    );
  }

  for (const run of textRuns) {
    lines.push(
      'q',
      `${pdfColor(run.color)} rg`,
      `${pdfColor(run.strokeColor)} RG`,
      `${pdfNumber(run.strokeWidth)} w`,
      'BT',
      `/${fontNames[run.font]} ${pdfNumber(run.size)} Tf`,
      `${pdfNumber(run.charSpacing)} Tc`,
      `${run.strokeWidth > 0 ? '2' : '0'} Tr`,
      `1 0 0 1 ${pdfNumber(run.x)} ${pdfNumber(run.y)} Tm`,
      `${pdfString(run.text)} Tj`,
      'ET',
      'Q',
    );
  }

  lines.push('Q');
  return lines.join('\n');
}

function makeObject(id: number, body: string) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function buildPdfBytes(content: string) {
  const objects = [
    makeObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    makeObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    makeObject(
      3,
      [
        '<< /Type /Page',
        '/Parent 2 0 R',
        `/MediaBox [0 0 ${PDF_WIDTH_PT} ${PDF_HEIGHT_PT}]`,
        '/Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R /F5 8 0 R /F6 9 0 R /F7 10 0 R /F8 11 0 R >> >>',
        '/Contents 12 0 R',
        '>>',
      ].join('\n'),
    ),
    makeObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
    makeObject(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>'),
    makeObject(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>'),
    makeObject(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Times-BoldItalic /Encoding /WinAnsiEncoding >>'),
    makeObject(8, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    makeObject(9, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    makeObject(10, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>'),
    makeObject(11, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>'),
    makeObject(12, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += [
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

function buildTextPdfBlob(page: HTMLElement) {
  const textRuns = collectTextRuns(page);
  if (textRuns.length === 0) {
    throw new Error('Generated PDF would contain no text. Please try again.');
  }

  const content = buildContentStream(textRuns, collectRules(page));
  return new Blob([buildPdfBytes(content)], { type: 'application/pdf' });
}

function measurePageFit(page: HTMLElement): ResumePageFit {
  const pageRect = page.getBoundingClientRect();
  const expectedHeightPx = pageRect.width * (PDF_HEIGHT_PT / PDF_WIDTH_PT);
  const usedHeightPx = Math.max(pageRect.height, page.scrollHeight);
  const usageRatio = expectedHeightPx > 0 ? usedHeightPx / expectedHeightPx : 1;
  const usedHeightPt = usageRatio * PDF_HEIGHT_PT;
  const overflowPt = Math.max(0, usedHeightPt - PDF_HEIGHT_PT);
  const status =
    usageRatio > 1.005 ? 'over' : usageRatio < 0.975 ? 'under' : 'fit';

  return {
    status,
    usageRatio,
    usedHeightPt,
    pageHeightPt: PDF_HEIGHT_PT,
    overflowPt,
  };
}

export async function inspectResumePageFit(elementId: string): Promise<ResumePageFit> {
  const wrapper = getExportWrapper(elementId);
  await waitForLayout();
  return measurePageFit(getResumePage(wrapper));
}

function collectDocumentCss() {
  const chunks: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      chunks.push(
        Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .join('\n'),
      );
    } catch {
      // Same-origin app styles are readable; cross-origin sheets are not required
      // for the resume template and would make export brittle.
    }
  }

  return chunks.join('\n');
}

function htmlTitleForFilename(filename: string) {
  return (filename.trim() || 'resume.pdf')
    .replace(/\.pdf$/i, '')
    .replace(/[<>]/g, '')
    .trim() || 'resume';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(wrapper: HTMLElement, filename: string) {
  const clone = wrapper.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('.resume-control').forEach((control) => control.remove());

  const title = htmlTitleForFilename(filename);
  const css = `
${collectDocumentCss()}
@page {
  size: Letter;
  margin: 0;
}
html,
body {
  width: 8.5in;
  min-height: 11in;
  margin: 0;
  padding: 0;
  background: #ffffff;
}
body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.resume-page-wrapper {
  margin: 0 !important;
  position: static !important;
  transform: none !important;
}
.resume-page {
  width: 8.5in !important;
  min-height: 11in;
  margin: 0 !important;
  box-shadow: none !important;
}
`;

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`,
    '</head>',
    '<body>',
    clone.outerHTML,
    '</body>',
    '</html>',
  ].join('');
}

async function buildBrowserRenderedPdfBlob(
  wrapper: HTMLElement,
  filename: string,
) {
  let response: Response;
  try {
    response = await fetch('/api/resume/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: buildPrintHtml(wrapper, filename),
        filename,
      }),
    });
  } catch (err) {
    throw new Error(
      err instanceof TypeError
        ? 'Local PDF renderer is unavailable. Start the full app with `npm run dev` so the API server is running, then try Download PDF again.'
        : err instanceof Error
          ? err.message
          : 'Local PDF renderer is unavailable.',
      { cause: err },
    );
  }

  if (!response.ok) {
    let detail =
      response.status === 404
        ? 'Local PDF renderer route was not found. Restart the API server so it picks up the latest backend code, then try Download PDF again.'
        : 'Failed to render PDF with the local browser engine.';
    try {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = await response.json();
        if (typeof body.error === 'string') {
          detail = body.error;
        }
      } else {
        const text = await response.text();
        if (text.trim()) {
          detail = text.trim();
        }
      }
    } catch {
      // Keep the generic renderer error if the response body is unreadable.
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  if (blob.type !== 'application/pdf') {
    throw new Error(
      'Local PDF renderer returned a non-PDF response. Make sure the full app is running with `npm run dev`, then try Download PDF again.',
    );
  }

  return blob;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function renderPdf(
  elementId: string,
  filename: string,
  mode: 'save' | 'blob',
): Promise<Blob | void> {
  const wrapper = getExportWrapper(elementId);

  await waitForLayout();
  const page = getResumePage(wrapper);
  const fit = measurePageFit(page);
  if (fit.status === 'over') {
    const overflowInches = fit.overflowPt / 72;
    throw new Error(
      `Resume is over one page by ${overflowInches.toFixed(2)} in. Tighten content or reduce type size before exporting so the PDF is not truncated.`,
    );
  }

  let blob: Blob;
  try {
    blob = await buildBrowserRenderedPdfBlob(wrapper, filename);
  } catch (err) {
    if (mode === 'save') {
      throw err;
    }

    const state = beginCapture(elementId);
    try {
      await waitForLayout();
      const page = getResumePage(state.wrapper);
      blob = buildTextPdfBlob(page);
    } finally {
      endCapture(state);
    }
  }

  if (mode === 'blob') {
    return blob;
  }

  downloadBlob(blob, filename);
}

export async function generateResumePdfBlob(
  elementId: string,
  filename: string,
): Promise<Blob> {
  const blob = await renderPdf(elementId, filename, 'blob');
  return blob as Blob;
}

export async function exportResumeToPdf(
  elementId: string,
  filename: string,
): Promise<void> {
  await renderPdf(elementId, filename, 'save');
}

export function validatePdfFile(file: File) {
  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    throw new Error('Please select a PDF file.');
  }

  if (file.size === 0) {
    throw new Error('The selected PDF file is empty.');
  }
}

export async function readPdfFileAsBase64(file: File) {
  validatePdfFile(file);
  const base64 = await blobToBase64(file);
  return {
    base64,
    filename: file.name.trim() || 'resume.pdf',
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
