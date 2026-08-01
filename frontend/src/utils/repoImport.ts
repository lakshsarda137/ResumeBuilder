import type { RepoItem } from '../types/repository';
import type {
  RepoImportEntry,
  RepoImportLineDiff,
  RepoImportMergeDiff,
  RepoImportMergeResult,
  RepoImportPayload,
  RepoImportProfile,
} from '../types/repoImport';
import { syncEducationFromImport } from './educationImport';

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeToken(token: string): string {
  if (token === 'engineering') return 'engineer';
  if (token === 'internship') return 'intern';
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenSet(value: string | null | undefined): Set<string> {
  return new Set(
    normalizeKeyPart(value)
      .split(' ')
      .map(normalizeToken)
      .filter(Boolean),
  );
}

function tokenOverlapScore(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(aTokens.size, bTokens.size);
}

export function entryMatchKey(entry: {
  type: string;
  title: string;
  company?: string | null;
}): string {
  return [entry.type, normalizeKeyPart(entry.title), normalizeKeyPart(entry.company)]
    .filter(Boolean)
    .join('|');
}

function fieldsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeKeyPart(a);
  const right = normalizeKeyPart(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))) {
    return true;
  }
  return tokenOverlapScore(left, right) >= 0.75;
}

function titlesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeKeyPart(a);
  const right = normalizeKeyPart(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (left.length >= 8 && right.length >= 8 && (left.includes(right) || right.includes(left))) {
    return true;
  }
  return tokenOverlapScore(left, right) >= 0.67;
}

const MONTHS = new Map<string, number>([
  ['jan', 1],
  ['january', 1],
  ['feb', 2],
  ['february', 2],
  ['mar', 3],
  ['march', 3],
  ['apr', 4],
  ['april', 4],
  ['may', 5],
  ['jun', 6],
  ['june', 6],
  ['jul', 7],
  ['july', 7],
  ['aug', 8],
  ['august', 8],
  ['sep', 9],
  ['sept', 9],
  ['september', 9],
  ['oct', 10],
  ['october', 10],
  ['nov', 11],
  ['november', 11],
  ['dec', 12],
  ['december', 12],
]);

function normalizeDateKey(value: string | null | undefined): string {
  const normalized = normalizeKeyPart(value);
  if (!normalized) {
    return '';
  }

  const iso = normalized.match(/\b((?:19|20)\d{2})\s+(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  }

  const year = normalized.match(/\b(19|20)\d{2}\b/)?.[0] ?? '';
  if (!year) {
    return '';
  }

  for (const [month, number] of MONTHS) {
    if (normalized.includes(month)) {
      return `${year}-${String(number).padStart(2, '0')}`;
    }
  }

  return year;
}

function datesCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeDateKey(a);
  const right = normalizeDateKey(b);
  if (!left || !right) {
    return false;
  }
  return left === right || left.slice(0, 4) === right.slice(0, 4);
}

function contentCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) {
    return false;
  }
  return tokenOverlapScore(a, b) >= 0.45;
}

function findImportMatch<T extends {
  id: string;
  type: string;
  title: string;
  company?: string | null;
  position?: string | null;
  start_date?: string | null;
  content?: string | null;
}>(
  existing: T[],
  entry: RepoImportEntry,
): T | undefined {
  if (entry.merge_target_id?.trim()) {
    const target = existing.find((item) => item.id === entry.merge_target_id?.trim());
    if (target) {
      return target;
    }
  }

  const exactKey = entryMatchKey(entry);
  const exact = existing.find((item) => entryMatchKey(item) === exactKey);
  if (exact) {
    return exact;
  }

  return existing.find((item) => {
    const companyMatches = fieldsCompatible(item.company, entry.company);
    const titleMatches =
      titlesCompatible(item.title, entry.title) ||
      titlesCompatible(item.title, entry.position) ||
      titlesCompatible(item.position, entry.title);
    const dateMatches = datesCompatible(item.start_date, entry.start_date);
    const sameType = item.type === entry.type;

    if (sameType && companyMatches && titleMatches) {
      return true;
    }

    if (sameType && companyMatches && dateMatches) {
      return true;
    }

    if (sameType) {
      return titleMatches && dateMatches;
    }

    if (!titleMatches) {
      return false;
    }

    // LinkedIn and resumes can disagree on whether the same thing is a
    // project or experience. Merge only with stronger cross-type evidence;
    // the saved type is preserved and remains editable by the user.
    return (
      companyMatches ||
      dateMatches ||
      contentCompatible(item.content, entry.freewrite)
    );
  });
}

function contentAlreadyIncluded(existing: string, incoming: string): boolean {
  const a = existing.trim();
  const b = incoming.trim();
  if (!b) return true;
  if (!a) return false;
  return a.includes(b);
}

function appendImportBlock(existing: string, incoming: string, sourceLabel: string): string {
  const block = incoming.trim();
  if (!block) return existing;
  const header = `\n\n---\nImported (${sourceLabel})\n\n`;
  if (!existing.trim()) return block;
  return `${existing.trim()}${header}${block}`;
}

function isExplicitMergeTarget(entry: RepoImportEntry, match: { id: string }): boolean {
  return Boolean(entry.merge_target_id?.trim() && entry.merge_target_id.trim() === match.id);
}

function splitDiffLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

export function createRepoImportLineDiff(before: string, after: string): RepoImportLineDiff[] {
  const beforeLines = splitDiffLines(before);
  const afterLines = splitDiffLines(after);
  const table: number[][] = Array.from({ length: beforeLines.length + 1 }, () =>
    Array(afterLines.length + 1).fill(0),
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        beforeLines[i] === afterLines[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const lines: RepoImportLineDiff[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      lines.push({ kind: 'context', text: beforeLines[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: 'removed', text: beforeLines[i] });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: afterLines[j] });
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    lines.push({ kind: 'removed', text: beforeLines[i] });
    i += 1;
  }

  while (j < afterLines.length) {
    lines.push({ kind: 'added', text: afterLines[j] });
    j += 1;
  }

  return lines;
}

function pickDate(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const current = existing?.trim();
  if (current) return current;
  const next = incoming?.trim();
  return next || null;
}

export function flattenImportPayload(payload: RepoImportPayload): RepoImportEntry[] {
  return (payload.entries ?? []).filter((e) => e.title?.trim() && e.freewrite?.trim());
}

function repairJsonString(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function expandToOutermostObject(text: string, anchorPos: number): string {
  let depth = 0;
  let start = -1;
  for (let i = anchorPos; i >= 0; i--) {
    if (text[i] === '}') depth++;
    else if (text[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start === -1) return '';
  depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function isRealImportPayload(parsed: RepoImportPayload): boolean {
  if (!parsed || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return false;
  return parsed.entries.some((e) => {
    const type = typeof e.type === 'string' ? e.type.trim() : '';
    const title = typeof e.title === 'string' ? e.title.trim().toLowerCase() : '';
    const freewrite = typeof e.freewrite === 'string' ? e.freewrite.trim() : '';

    return (
      (type === 'experience' || type === 'project') &&
      title !== 'role or project name' &&
      freewrite.length > 15 &&
      !/raw narrative freewrite/i.test(freewrite)
    );
  });
}

function extractResponseJsonFromText(text: string): string {
  const anchors = ['"freewrite":', '"source_label":', '"entries":'];
  for (const anchor of anchors) {
    let pos = text.lastIndexOf(anchor);
    while (pos !== -1) {
      const candidate = expandToOutermostObject(text, pos);
      if (candidate) {
        try {
          const parsed = JSON.parse(repairJsonString(candidate)) as RepoImportPayload;
          if (isRealImportPayload(parsed)) {
            return candidate;
          }
        } catch {
          // try earlier occurrence
        }
      }
      pos = text.lastIndexOf(anchor, pos - 1);
    }
  }
  return '';
}

function getDelimitedJsonCandidates(text: string): string[] {
  return [...text.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

export function parseRepoImportResponse(raw: string): RepoImportPayload {
  const candidates: string[] = [];

  // Best path: explicit delimiters written by the model.
  const delimitedCandidates = getDelimitedJsonCandidates(raw);
  for (let index = delimitedCandidates.length - 1; index >= 0; index -= 1) {
    candidates.push(delimitedCandidates[index]);
  }

  // Fallback: fenced code block.
  const fenceMatches = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fenceMatches.length > 0) {
    candidates.push(fenceMatches[fenceMatches.length - 1][1].trim());
  }

  // Last resort: anchor-based extraction.
  const anchorBased = extractResponseJsonFromText(raw);
  if (anchorBased) candidates.push(anchorBased);

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(repairJsonString(candidate)) as RepoImportPayload;
      if (parsed && Array.isArray(parsed.entries)) {
        return parsed;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `Could not parse import response. The AI may have returned truncated output. Last error: ${errors[errors.length - 1] ?? 'unknown'}`,
  );
}

export interface RepoImportMergePlan {
  create: Array<Omit<RepoItem, 'id' | 'created_at' | 'updated_at'>>;
  patch: Array<{ id: string; body: Partial<RepoItem>; diff: RepoImportMergeDiff }>;
  skipped: number;
}

export function planRepoImportMerge(
  existing: RepoItem[],
  incoming: RepoImportEntry[],
  sourceLabel: string,
): RepoImportMergePlan {
  const candidates = [...existing];

  const create: RepoImportMergePlan['create'] = [];
  const patch: RepoImportMergePlan['patch'] = [];
  let skipped = 0;

  for (const entry of incoming) {
    const freewrite = entry.freewrite?.trim();
    if (!entry.title?.trim() || !freewrite) {
      skipped += 1;
      continue;
    }

    const match = findImportMatch(candidates, entry);

    if (match) {
      const explicitMergeTarget = isExplicitMergeTarget(entry, match);

      if (!explicitMergeTarget && contentAlreadyIncluded(match.content, freewrite)) {
        skipped += 1;
        continue;
      }

      const nextContent = explicitMergeTarget
        ? freewrite
        : appendImportBlock(match.content, freewrite, sourceLabel);
      const body: Partial<RepoItem> = {
        content: nextContent,
        mode: 'freewrite',
      };

      if (explicitMergeTarget) {
        body.type = entry.type;
        body.title = entry.title.trim();
        if (entry.company !== undefined) body.company = entry.company?.trim() || null;
        if (entry.position !== undefined) body.position = entry.position?.trim() || null;
        if (entry.start_date !== undefined) body.start_date = entry.start_date?.trim() || null;
        if (entry.end_date !== undefined) body.end_date = entry.end_date?.trim() || null;
      } else {
        body.company = pickDate(match.company, entry.company ?? null);
        body.position = pickDate(match.position, entry.position ?? null);
        body.start_date = pickDate(match.start_date, entry.start_date ?? null);
        body.end_date = pickDate(match.end_date, entry.end_date ?? null);
      }

      const unchanged = Object.entries(body).every(
        ([key, value]) => match[key as keyof RepoItem] === value,
      );

      if (unchanged) {
        skipped += 1;
        continue;
      }

      patch.push({
        id: match.id,
        body,
        diff: {
          id: match.id,
          title: match.title,
          company: match.company,
          sourceLabel,
          before: match.content,
          after: nextContent,
          lines: createRepoImportLineDiff(match.content, nextContent),
        },
      });
      Object.assign(match, body);
      continue;
    }

    const newItem = {
      type: entry.type,
      title: entry.title.trim(),
      company: entry.company?.trim() || null,
      position: entry.position?.trim() || null,
      start_date: entry.start_date?.trim() || null,
      end_date: entry.end_date?.trim() || null,
      mode: 'freewrite' as const,
      content: freewrite,
    };

    create.push(newItem);
    candidates.push({
      ...newItem,
      id: `pending-${create.length}`,
      created_at: new Date().toISOString(),
    });
  }

  return { create, patch, skipped };
}

export async function applyRepoImportMerge(
  existing: RepoItem[],
  incoming: RepoImportEntry[],
  sourceLabel: string,
  profile?: RepoImportProfile,
): Promise<RepoImportMergeResult> {
  const plan = planRepoImportMerge(existing, incoming, sourceLabel);
  let created = 0;
  let merged = 0;

  for (const item of plan.create) {
    const res = await fetch('/api/repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) {
      throw new Error('Failed to create repository entry during import.');
    }
    created += 1;
  }

  for (const { id, body } of plan.patch) {
    const res = await fetch(`/api/repo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error('Failed to merge into existing repository entry.');
    }
    merged += 1;
  }

  const education = await syncEducationFromImport(profile, sourceLabel);

  return {
    created,
    merged,
    skipped: plan.skipped,
    mergeDiffs: plan.patch.map(({ diff }) => diff),
    ...education,
  };
}
