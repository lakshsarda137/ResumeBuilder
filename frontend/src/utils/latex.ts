/**
 * LaTeX generation for the resume.
 *
 * The on-screen editor stays HTML; this module turns the same `ResumeData`
 * plus render settings into a self-contained .tex document in the style of
 * Jake's Resume, so Download PDF compiles through a real TeX engine and the
 * source can be pasted straight into Overleaf. Section order, link
 * derivation, and styling flags are read from the same settings the renderer
 * uses so the PDF and the preview never disagree about structure.
 */
import type { ResumeData, ResumeEntry, ResumeSection } from '../types/resume';
import { mergeResumeRenderSettings, type ResumeRenderSettings } from './resumeSettings';
import { contactHrefLoose } from './resumeLinks';
import { orderSectionsForDisplay } from './sectionOrder';

const UNICODE_TO_LATEX: Record<string, string> = {
  '×': '$\\times$',
  '·': '$\\cdot$',
  '∙': '$\\cdot$',
  '‧': '$\\cdot$',
  '≥': '$\\geq$',
  '≤': '$\\leq$',
  '→': '$\\rightarrow$',
  '←': '$\\leftarrow$',
  '•': '$\\bullet$',
  '≈': '$\\approx$',
  '°': '$^\\circ$',
  '…': '\\ldots{}',
  '’': "'",
  '‘': '`',
  '“': '``',
  '”': "''",
  '\u2011': '-',
  '\u2212': '--',
  '½': '$\\frac{1}{2}$',
  '™': '\\texttrademark{}',
  '©': '\\copyright{}',
  '€': '\\euro{}',
  '£': '\\pounds{}',
  '§': '\\S{}',
};

/** Escape plain text for LaTeX text mode. */
export function escapeLatex(text: string): string {
  let out = '';
  for (const ch of text) {
    switch (ch) {
      case '\\':
        out += '\\textbackslash{}';
        break;
      case '{':
        out += '\\{';
        break;
      case '}':
        out += '\\}';
        break;
      case '&':
      case '%':
      case '$':
      case '#':
      case '_':
        out += `\\${ch}`;
        break;
      case '~':
        out += '\\textasciitilde{}';
        break;
      case '^':
        out += '\\textasciicircum{}';
        break;
      case '<':
        out += '\\textless{}';
        break;
      case '>':
        out += '\\textgreater{}';
        break;
      case '|':
        out += '\\textbar{}';
        break;
      case '–':
        out += '--';
        break;
      case '—':
        out += '---';
        break;
      case '\u00a0':
        out += '~';
        break;
      default:
        out += UNICODE_TO_LATEX[ch] ?? ch;
    }
  }
  return out;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, '&');
}

/** Strip every tag and entity, for places LaTeX cannot take markup. */
export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const VOID_TAGS = new Set(['br', 'img', 'hr', 'wbr', 'input']);

function wrapperForTag(name: string, attrs: string): string {
  if (name === 'strong' || name === 'b') return '\\textbf{';
  if (name === 'em' || name === 'i') return '\\emph{';
  if (name === 'u') return '\\underline{';
  if (name === 'span' || name === 'font') {
    const style = /style\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '';
    let wrapper = '';
    const weight = /font-weight\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim().toLowerCase();
    if (weight && (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600)) {
      wrapper += '\\textbf{';
    }
    if (/font-style\s*:\s*italic/i.test(style)) {
      wrapper += '\\emph{';
    }
    if (/text-decoration\s*:[^;]*underline/i.test(style)) {
      wrapper += '\\underline{';
    }
    return wrapper;
  }
  return '';
}

/**
 * Convert the restricted inline HTML the editor stores (<strong>, <em>,
 * <span style="font-weight/font-style">) into LaTeX. Every other tag is
 * dropped; text nodes are escaped.
 */
export function inlineHtmlToLatex(html: string): string {
  const tagRe = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  const stack: number[] = [];
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;

  const emitText = (raw: string) => {
    if (!raw) return;
    out += escapeLatex(decodeEntities(raw).replace(/\s+/g, ' '));
  };

  while ((match = tagRe.exec(html))) {
    emitText(html.slice(last, match.index));
    last = tagRe.lastIndex;
    const isClose = match[0].startsWith('</');
    const name = match[1].toLowerCase();
    const attrs = match[2] ?? '';
    if (name === 'br') {
      out += '\\\\ ';
      continue;
    }
    if (VOID_TAGS.has(name) || /\/\s*$/.test(attrs)) {
      continue;
    }
    if (isClose) {
      const braces = stack.pop() ?? 0;
      out += '}'.repeat(braces);
      continue;
    }
    const wrapper = wrapperForTag(name, attrs);
    stack.push((wrapper.match(/\{/g) ?? []).length);
    out += wrapper;
  }
  emitText(html.slice(last));
  while (stack.length > 0) {
    out += '}'.repeat(stack.pop() ?? 0);
  }
  return out.trim();
}

/** hyperref's \href URL argument only needs # and % escaped. */
function escapeUrl(url: string): string {
  return url.replace(/%/g, '\\%').replace(/#/g, '\\#');
}

/**
 * TeX sets a slightly wider-looking text block than the browser at the same
 * margin, so the LaTeX side margins run 0.1in inside the editor setting.
 */
const LATEX_SIDE_MARGIN_TRIM_IN = 0.1;
const LATEX_MIN_SIDE_MARGIN_IN = 0.25;

/** TeX text reads a touch smaller than the browser at the same size, and the heading-to-first-entry gap a touch tighter. */
const LATEX_BODY_SIZE_OFFSET_PT = 0.25;
const LATEX_HEADING_AFTER_EXTRA_PT = 2;

function latexSideMargin(inches: number): number {
  return Math.max(LATEX_MIN_SIDE_MARGIN_IN, inches - LATEX_SIDE_MARGIN_TRIM_IN);
}

function fmt(value: number, digits = 2): string {
  return Number(value.toFixed(digits)).toString();
}

function fontPackage(family: string): string {
  const name = family.toLowerCase();
  if (name.includes('times')) return '\\usepackage{times}';
  if (name.includes('palatino') || name.includes('book antiqua')) return '\\usepackage{palatino}';
  if (name.includes('garamond')) return '\\usepackage{ebgaramond}';
  if (name.includes('helvetica') || name.includes('arial') || name.includes('inter') || name.includes('calibri')) {
    return '\\usepackage{helvet}\n\\renewcommand{\\familydefault}{\\sfdefault}';
  }
  return '% Computer Modern (LaTeX default)';
}

function styleCommand(bold: boolean, italic: boolean): string {
  const open = `${bold ? '\\textbf{' : ''}${italic ? '\\textit{' : ''}`;
  const close = '}'.repeat((open.match(/\{/g) ?? []).length);
  return `${open}#1${close}`;
}

function renderEntry(section: ResumeSection, entry: ResumeEntry): string {
  const title = inlineHtmlToLatex(entry.title);
  const links = (entry.links ?? [])
    .map((link) => ` $|$ \\href{${escapeUrl(link.url)}}{${escapeLatex(link.label)}}`)
    .join('');
  const note = entry.titleNote?.trim() ? ` $|$ ${inlineHtmlToLatex(entry.titleNote)}` : '';
  const titleCell = `\\rsTitle{${title}}${note}${links}`;
  const subtitle = entry.subtitle.trim() ? `\\rsSub{${inlineHtmlToLatex(entry.subtitle)}}` : '';
  const date = entry.date.trim() ? `\\rsDate{${inlineHtmlToLatex(entry.date)}}` : '';
  const location = entry.location.trim() ? `\\rsLoc{${inlineHtmlToLatex(entry.location)}}` : '';

  // Mirror the renderer: experience puts the date beside the employer and the
  // location beside the role; every other section puts the location beside
  // the title (when present) and the date on the second line.
  let right1: string;
  let right2: string;
  if (section.type === 'experience' || !location) {
    right1 = date;
    right2 = section.type === 'experience' ? location : '';
  } else {
    right1 = location;
    right2 = date;
  }

  const rows = [`${titleCell} & ${right1} \\\\`];
  if (subtitle || right2) {
    rows.push(`${subtitle} & ${right2} \\\\`);
  }

  const bullets = entry.bullets
    .map((bullet) => inlineHtmlToLatex(bullet.text))
    .filter(Boolean)
    .map((text) => `      \\resumeItem{${text}}`);

  const lines = [
    '  \\item',
    '    \\begin{tabular*}{\\textwidth}[t]{@{}l@{\\extracolsep{\\fill}}r@{}}',
    ...rows.map((row) => `      ${row}`),
    '    \\end{tabular*}',
  ];
  if (bullets.length > 0) {
    lines.push('    \\resumeItemListStart', ...bullets, '    \\resumeItemListEnd');
  }
  return lines.join('\n');
}

function renderSkills(section: ResumeSection): string {
  const rows = (section.skills ?? [])
    .filter((skill) => plainText(skill.label) || plainText(skill.items))
    .map(
      (skill) =>
        `    \\rsSkill{${inlineHtmlToLatex(skill.label)}}: ${inlineHtmlToLatex(skill.items)}`,
    );
  if (rows.length === 0) {
    return '';
  }
  return [
    '  \\item',
    rows.join(' \\\\\n'),
  ].join('\n');
}

function renderSection(section: ResumeSection, settings: ResumeRenderSettings): string {
  const heading = settings.sectionHeadingUppercase
    ? plainText(section.title).toUpperCase()
    : plainText(section.title);
  if (!heading) {
    return '';
  }

  let body: string;
  if (section.type === 'skills') {
    body = renderSkills(section);
  } else {
    body = section.entries
      .filter((entry) => plainText(entry.title) || entry.bullets.some((b) => plainText(b.text)))
      .map((entry) => renderEntry(section, entry))
      .join('\n');
  }
  if (!body) {
    return '';
  }

  return [
    `\\section{${escapeLatex(heading)}}`,
    '\\resumeSubHeadingListStart',
    body,
    '\\resumeSubHeadingListEnd',
  ].join('\n');
}

function renderHeader(data: ResumeData, settings: ResumeRenderSettings): string {
  if (!settings.showHeader) {
    return '';
  }
  const name = inlineHtmlToLatex(data.contact.name);
  const contact = data.contact.links
    .filter((link) => plainText(link.value))
    .map((link) => {
      const href = contactHrefLoose(link.value);
      const text = inlineHtmlToLatex(link.label?.trim() || link.value);
      return href ? `\\href{${escapeUrl(href)}}{${text}}` : text;
    })
    .join(' $|$ ');
  const nameSize = settings.nameFontSize;
  return [
    '\\begin{center}',
    `  {\\fontsize{${fmt(nameSize)}}{${fmt(nameSize * 1.1)}}\\selectfont\\textbf{${name}}} \\\\ \\vspace{2pt}`,
    `  ${contact}`,
    '\\end{center}',
    '\\vspace{-4pt}',
  ].join('\n');
}

/** Build the complete .tex document for a resume. */
export function buildResumeLatex(
  data: ResumeData,
  rawSettings?: Partial<ResumeRenderSettings> | null,
): string {
  const s = mergeResumeRenderSettings(rawSettings);
  const bodySize = s.bulletFontSize + LATEX_BODY_SIZE_OFFSET_PT;
  const headingAfter = s.sectionHeaderSpacing + LATEX_HEADING_AFTER_EXTRA_PT;
  const docSize = bodySize < 10.5 ? 10 : bodySize < 11.5 ? 11 : 12;
  const headingSize = s.headingFontSize;
  const headingStyle = `${s.sectionHeadingBold ? '\\bfseries' : ''}${s.sectionHeadingItalic ? '\\itshape' : ''}`;

  const sections = orderSectionsForDisplay(data.sections, s.sectionHeadings)
    .map((section) => renderSection(section, s))
    .filter(Boolean)
    .join('\n\n');

  return `% Generated by Resume Builder. Paste into Overleaf as main.tex and compile with pdfLaTeX or XeLaTeX.
\\documentclass[letterpaper,${docSize}pt]{article}

\\usepackage[top=${fmt(s.pagePaddingTop)}in,left=${fmt(latexSideMargin(s.pagePaddingLeft))}in,right=${fmt(latexSideMargin(s.pagePaddingRight))}in,bottom=${fmt(s.pagePaddingBottom)}in]{geometry}
\\usepackage[T1]{fontenc}
${fontPackage(s.bodyFontFamily)}
\\usepackage{anyfontsize}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\definecolor{linkblue}{RGB}{31,73,125}
\\usepackage[colorlinks=true,allcolors=black,urlcolor=linkblue]{hyperref}
\\usepackage{fancyhdr}
\\usepackage{tabularx}
\\usepackage{textcomp}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\urlstyle{same}
\\raggedbottom
\\raggedright
% No hyphenation: a resume must never split "procurement" or "self-play" across lines.
\\hyphenpenalty=10000
\\exhyphenpenalty=10000
\\tolerance=2000
\\setlength{\\tabcolsep}{0in}
\\setlength{\\parindent}{0pt}

% Section headings: ${fmt(headingSize)}pt with a rule beneath, ${fmt(s.sectionSpacing)}pt above and ${fmt(headingAfter)}pt below.
\\titleformat{\\section}{\\fontsize{${fmt(headingSize)}}{${fmt(headingSize * 1.2)}}\\selectfont${headingStyle}}{}{0em}{}[\\vspace{-3pt}\\titlerule]
\\titlespacing*{\\section}{0pt}{${fmt(s.sectionSpacing)}pt}{${fmt(headingAfter)}pt}

% Entry styling, mirrored from the editor's style settings.
\\newcommand{\\rsTitle}[1]{${styleCommand(s.entryTitleBold, s.entryTitleItalic)}}
\\newcommand{\\rsSub}[1]{${styleCommand(false, s.subtitleItalic)}}
\\newcommand{\\rsDate}[1]{${styleCommand(s.dateBold, s.dateItalic)}}
\\newcommand{\\rsLoc}[1]{${styleCommand(s.dateBold, s.dateItalic)}}
\\newcommand{\\rsSkill}[1]{${styleCommand(s.skillLabelBold, false)}}

\\newcommand{\\resumeItem}[1]{\\item #1}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0pt, label={}, itemsep=${fmt(s.entrySpacing)}pt, topsep=0pt, parsep=0pt, partopsep=0pt]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}\\vspace{-2pt}} % trims the list-end leading above the next heading
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=${fmt(s.bulletIndent + 6)}pt, labelsep=4pt, label=\\textbullet, itemsep=0.5pt, topsep=1pt, parsep=0pt, partopsep=0pt]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}

\\begin{document}
% Body ${fmt(bodySize)}pt on a ${fmt(bodySize * s.lineHeight)}pt baseline (line height ${fmt(s.lineHeight)}).
\\fontsize{${fmt(bodySize)}}{${fmt(bodySize * s.lineHeight)}}\\selectfont

${renderHeader(data, s)}

${sections}

\\end{document}
`;
}

export interface LatexPdfResult {
  blob: Blob;
  /** Page count reported by the TeX engine, when available. */
  pages: number | null;
}

/** Compile a .tex document through the local API (Tectonic). */
export async function compileLatexToPdf(tex: string, filename: string): Promise<LatexPdfResult> {
  const res = await fetch('/api/latex/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tex, filename }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `LaTeX compile failed (${res.status}).`);
  }
  const header = res.headers.get('X-Page-Count');
  const pages = header && Number(header) > 0 ? Number(header) : null;
  return { blob: await res.blob(), pages };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
