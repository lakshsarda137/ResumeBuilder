/**
 * Education dates.
 *
 * House style shows only the graduation date on a school entry, never the
 * start: "May 2029 (Expected Graduation)" while the degree is in progress, and
 * plain "May 2025" once it is finished. Models still occasionally emit the old
 * "Aug 2025 – May 2029" range, so this module is the deterministic backstop:
 * after a resume is parsed, every education date is rewritten from the saved
 * Education record (when one matches) or from the last date the model wrote.
 */
import type { EducationData, EducationItem } from '../types/education';
import type { ResumeData, ResumeEntry } from '../types/resume';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export interface MonthYear {
  month: number | null;
  year: number;
}

/**
 * Parse the loose date spellings the Education page and imports accept:
 * "2029-05", "05/2029", "May 2029", "Expected May 2029", "2029".
 */
export function parseMonthYear(raw: string | null | undefined): MonthYear | null {
  const text = (raw ?? '').trim();
  if (!text) {
    return null;
  }

  const iso = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (iso) {
    const month = Number(iso[2]) - 1;
    return { year: Number(iso[1]), month: month >= 0 && month < 12 ? month : null };
  }

  const numeric = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    return { year: Number(numeric[2]), month: month >= 0 && month < 12 ? month : null };
  }

  const named = text.match(/([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (named) {
    const month = MONTH_LOOKUP[named[1].toLowerCase()];
    if (month !== undefined) {
      return { year: Number(named[2]), month };
    }
  }

  const yearOnly = text.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), month: null };
  }

  return null;
}

export function formatMonthYear(value: MonthYear): string {
  return value.month === null ? String(value.year) : `${MONTHS[value.month]} ${value.year}`;
}

export const EXPECTED_GRADUATION_SUFFIX = '(Expected Graduation)';

/** The LAST month/year in a date field: the graduation end of a range. */
function lastMonthYear(raw: string | null | undefined): MonthYear | null {
  const text = (raw ?? '').replace(/<[^>]*>/g, ' ').trim();
  if (!text) {
    return null;
  }
  const parts = text.split(/\s*(?:–|—|\bto\b|\s-\s)\s*/i).filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const parsed = parseMonthYear(parts[index]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function isFuture(value: MonthYear, now: Date): boolean {
  const month = value.month ?? 11;
  return value.year > now.getFullYear() || (value.year === now.getFullYear() && month > now.getMonth());
}

/** "May 2029 (Expected Graduation)" for a future date, "May 2025" for a past one. */
export function formatGraduationDate(value: MonthYear, now = new Date()): string {
  const base = formatMonthYear(value);
  return isFuture(value, now) ? `${base} ${EXPECTED_GRADUATION_SUFFIX}` : base;
}

function normalizeSchool(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(the|of|at|university|college|institute|school)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchEducationItem(entry: ResumeEntry, items: EducationItem[]): EducationItem | null {
  const title = normalizeSchool(entry.title);
  if (!title) {
    return null;
  }
  for (const item of items) {
    const school = normalizeSchool(item.school);
    if (school && (title.includes(school) || school.includes(title))) {
      return item;
    }
  }
  return null;
}

/**
 * Rewrite every education entry's date to graduation-only form. The saved
 * record's grad_date wins when the entry matches one; otherwise the last date
 * in the model's own field is used. A field with no parseable date is left
 * alone rather than guessed at.
 */
export function enforceEducationGraduationDates(
  resume: ResumeData,
  education?: EducationData | null,
): ResumeData {
  const items = education?.items ?? [];
  let changed = false;

  const sections = resume.sections.map((section) => {
    if (section.type !== 'education') {
      return section;
    }
    const entries = section.entries.map((entry) => {
      const match = matchEducationItem(entry, items);
      const grad = parseMonthYear(match?.grad_date) ?? lastMonthYear(entry.date);
      if (!grad) {
        return entry;
      }
      const date = formatGraduationDate(grad);
      if (date === entry.date) {
        return entry;
      }
      changed = true;
      return { ...entry, date };
    });
    return { ...section, entries };
  });

  return changed ? { ...resume, sections } : resume;
}
