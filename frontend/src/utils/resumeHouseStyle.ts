/**
 * Deterministic house style for generated resumes.
 *
 * The writing contract states each of these rules, but they are mechanical
 * enough that a model slipping on one should never reach the page. Applied to
 * every resume the app GENERATES (never to a faithful PDF transcription):
 *
 * - no location on experience or project entries;
 * - no bold anywhere in content: bullets, subtitles, title notes, skill rows
 *   (entry names and section headings get their weight from the renderer);
 * - every experience/project/custom bullet ends in a full stop;
 * - education shows only the graduation date, "May 2029 (Expected Graduation)".
 */
import type { ResumeBullet, ResumeData, ResumeEntry, SectionType } from '../types/resume';
import { enforceEducationGraduationDates } from './educationDates';

const NO_LOCATION_SECTIONS: SectionType[] = ['experience', 'projects'];
const FULL_STOP_SECTIONS: SectionType[] = ['experience', 'projects', 'custom'];

/**
 * Remove bold markup while keeping the text: <strong>/<b> tags, and any
 * font-weight declaration inside a span style (dropping the span when nothing
 * else is left in its style).
 */
export function stripBold(html: string): string {
  return html
    .replace(/<\s*\/?\s*(strong|b)(\s[^>]*)?>/gi, '')
    .replace(
      /<span\b([^>]*)\sstyle=(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/span>/gi,
      (match, before: string, _quote: string, style: string, after: string, inner: string) => {
        if (!/font-weight/i.test(style)) {
          return match;
        }
        const kept = style
          .split(';')
          .map((part) => part.trim())
          .filter((part) => part && !/^font-weight\s*:/i.test(part));
        if (kept.length === 0 && !`${before}${after}`.trim()) {
          return inner;
        }
        return `<span${before}${kept.length ? ` style="${kept.join('; ')}"` : ''}${after}>${inner}</span>`;
      },
    );
}

/** Append a full stop unless the visible text already ends in terminal punctuation. */
export function ensureFullStop(html: string): string {
  const trimmed = html.replace(/\s+$/, '');
  const visible = trimmed.replace(/(<\/[a-z0-9]+>\s*)+$/i, '');
  if (!visible.replace(/<[^>]*>/g, '').trim()) {
    return html;
  }
  if (/[.!?]$/.test(visible)) {
    return trimmed;
  }
  // Drop a trailing comma/semicolon/colon rather than stacking a period on it.
  const cleaned = visible.replace(/[,;:]+$/, '');
  return `${cleaned}.${trimmed.slice(visible.length)}`;
}

function styleBullet(bullet: ResumeBullet, fullStop: boolean): ResumeBullet {
  const text = stripBold(bullet.text);
  return { ...bullet, text: fullStop ? ensureFullStop(text) : text };
}

function styleEntry(entry: ResumeEntry, type: SectionType): ResumeEntry {
  const titleNote = entry.titleNote ? stripBold(entry.titleNote).trim() : '';
  const next: ResumeEntry = {
    ...entry,
    location: NO_LOCATION_SECTIONS.includes(type) ? '' : entry.location,
    subtitle: stripBold(entry.subtitle),
    bullets: entry.bullets.map((bullet) => styleBullet(bullet, FULL_STOP_SECTIONS.includes(type))),
  };
  if (titleNote) {
    next.titleNote = titleNote;
  } else {
    delete next.titleNote;
  }
  return next;
}

export function applyResumeHouseStyle(resume: ResumeData): ResumeData {
  const sections = resume.sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => styleEntry(entry, section.type)),
    ...(section.skills
      ? {
          skills: section.skills.map((skill) => ({
            ...skill,
            label: stripBold(skill.label),
            items: stripBold(skill.items),
          })),
        }
      : {}),
  }));
  return enforceEducationGraduationDates({ ...resume, sections });
}
