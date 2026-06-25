import type { OngoingItem, RepoItem } from '../types/repository';
import type {
  RepoImportEntry,
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

export function parseRepoImportResponse(raw: string): RepoImportPayload {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = (fence?.[1] ?? objectMatch?.[0] ?? raw).trim();
  const parsed = JSON.parse(candidate) as RepoImportPayload;

  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error('Import response missing entries array.');
  }

  return parsed;
}

export interface RepoImportMergePlan {
  create: Array<Omit<RepoItem, 'id' | 'created_at' | 'updated_at'>>;
  patch: Array<{ id: string; body: Partial<RepoItem> }>;
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
      if (contentAlreadyIncluded(match.content, freewrite)) {
        skipped += 1;
        continue;
      }

      patch.push({
        id: match.id,
        body: {
          content: appendImportBlock(match.content, freewrite, sourceLabel),
          mode: 'freewrite',
          company: pickDate(match.company, entry.company ?? null),
          position: pickDate(match.position, entry.position ?? null),
          start_date: pickDate(match.start_date, entry.start_date ?? null),
          end_date: pickDate(match.end_date, entry.end_date ?? null),
        },
      });
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

const ONGOING_END_MARKERS = new Set(['present', 'ongoing', 'current', 'now']);

export function isOngoingImportEntry(entry: RepoImportEntry): boolean {
  if (entry.type !== 'experience' && entry.type !== 'project') {
    return false;
  }

  const end = entry.end_date?.trim().toLowerCase();
  if (!end) {
    return true;
  }

  return ONGOING_END_MARKERS.has(end);
}

function reflectionAlreadyIncludes(
  reflections: OngoingItem['reflections'],
  freewrite: string,
): boolean {
  return reflections.some((reflection) =>
    contentAlreadyIncluded(reflection.content, freewrite),
  );
}

function buildImportReflection(freewrite: string, sourceLabel: string): string {
  return `Imported (${sourceLabel})\n\n${freewrite.trim()}`;
}

export async function syncOngoingFromImport(
  incoming: RepoImportEntry[],
  sourceLabel: string,
): Promise<Pick<RepoImportMergeResult, 'ongoingCreated' | 'ongoingUpdated' | 'ongoingSkipped'>> {
  const res = await fetch('/api/ongoing');
  if (!res.ok) {
    throw new Error('Failed to load ongoing items.');
  }

  const existing = (await res.json()) as OngoingItem[];
  const candidates = [...existing];

  let ongoingCreated = 0;
  let ongoingUpdated = 0;
  let ongoingSkipped = 0;

  for (const entry of incoming) {
    if (!isOngoingImportEntry(entry) || !entry.title?.trim()) {
      continue;
    }

    const freewrite = entry.freewrite?.trim();
    const match = findImportMatch(candidates, entry);

    if (match) {
      if (match.status !== 'active') {
        ongoingSkipped += 1;
        continue;
      }

      let touched = false;
      const body: Partial<OngoingItem> = {};

      if (!match.company?.trim() && entry.company?.trim()) {
        body.company = entry.company.trim();
      }
      if (!match.position?.trim() && entry.position?.trim()) {
        body.position = entry.position.trim();
      }
      if (!match.start_date?.trim() && entry.start_date?.trim()) {
        body.start_date = entry.start_date.trim();
      }

      if (Object.keys(body).length > 0) {
        const patchRes = await fetch(`/api/ongoing/${match.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!patchRes.ok) {
          throw new Error('Failed to update linked ongoing item during import.');
        }
        touched = true;
      }

      if (freewrite && !reflectionAlreadyIncludes(match.reflections, freewrite)) {
        const reflectionRes = await fetch(`/api/ongoing/${match.id}/reflection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: buildImportReflection(freewrite, sourceLabel),
          }),
        });
        if (!reflectionRes.ok) {
          throw new Error('Failed to add reflection to linked ongoing item.');
        }
        touched = true;
      }

      if (touched) {
        ongoingUpdated += 1;
      } else {
        ongoingSkipped += 1;
      }
      continue;
    }

    const createRes = await fetch('/api/ongoing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: entry.type,
        title: entry.title.trim(),
        company: entry.company?.trim() || null,
        position: entry.position?.trim() || null,
        start_date: entry.start_date?.trim() || null,
      }),
    });
    if (!createRes.ok) {
      throw new Error('Failed to create ongoing item during import.');
    }

    const createdItem = (await createRes.json()) as OngoingItem;
    ongoingCreated += 1;

    if (freewrite) {
      const reflectionRes = await fetch(`/api/ongoing/${createdItem.id}/reflection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: buildImportReflection(freewrite, sourceLabel),
        }),
      });
      if (!reflectionRes.ok) {
        throw new Error('Failed to seed reflection on new ongoing item.');
      }
    }

    candidates.push({ ...createdItem, reflections: createdItem.reflections ?? [] });
  }

  return { ongoingCreated, ongoingUpdated, ongoingSkipped };
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

  const ongoing = await syncOngoingFromImport(incoming, sourceLabel);
  const education = await syncEducationFromImport(profile, sourceLabel);

  return {
    created,
    merged,
    skipped: plan.skipped,
    ...ongoing,
    ...education,
  };
}
