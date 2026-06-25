import type { OngoingItem, RepoItem, RepositorySource } from '../types/repository';

export function getOngoingFreewrite(item: OngoingItem): string {
  if (item.status === 'done' && item.compiled?.trim()) {
    return item.compiled.trim();
  }

  if (item.reflections.length === 0) {
    return '';
  }

  const header = [
    item.title,
    item.company ? `at ${item.company}` : null,
    item.position ? `(${item.position})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const dates = `${item.start_date ?? 'Unknown start'} – ${
    item.status === 'active' ? 'Present' : item.end_date ?? '?'
  }`;

  return [header, dates, '', ...item.reflections.map((r) => `- ${r.content}`)].join(
    '\n',
  );
}

export function repoItemToSource(item: RepoItem): RepositorySource {
  const sendable = item.mode === 'freewrite' && item.content.trim().length > 0;

  return {
    id: item.id,
    kind: 'repo',
    type: item.type,
    title: item.title,
    company: item.company,
    position: item.position,
    start_date: item.start_date,
    end_date: item.end_date,
    freewrite: sendable ? item.content.trim() : '',
    sendable,
  };
}

export function ongoingItemToSource(item: OngoingItem): RepositorySource {
  const freewrite = getOngoingFreewrite(item);

  return {
    id: item.id,
    kind: 'ongoing',
    type: item.type,
    title: item.title,
    company: item.company,
    position: item.position,
    start_date: item.start_date,
    end_date: item.end_date,
    freewrite,
    sendable: freewrite.trim().length > 0,
    status: item.status,
  };
}

function parseApproxDate(value: string | null): Date | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim();
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1);
  }

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return new Date(Number(yearMatch[0]), 0, 1);
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function isRepoWithinYears(item: RepoItem, maxYears: number): boolean {
  const reference =
    parseApproxDate(item.end_date) ??
    parseApproxDate(item.start_date);

  if (!reference) {
    return true;
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - maxYears);
  return reference >= cutoff;
}

export function isOngoingOlderThanMonths(
  item: OngoingItem,
  minMonths: number,
): boolean {
  const start = parseApproxDate(item.start_date);
  if (!start) {
    return false;
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - minMonths);
  return start <= cutoff;
}

export function filterSendableSources(sources: RepositorySource[]) {
  return sources.filter((source) => source.sendable && source.freewrite.trim());
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceIdentityKey(source: RepositorySource): string {
  const title = normalizeIdentityPart(source.title);
  const company = normalizeIdentityPart(source.company);
  const position = normalizeIdentityPart(source.position);
  const startDate = normalizeIdentityPart(source.start_date);

  if (!title || (!company && !position && !startDate)) {
    return `${source.kind}:${source.id}`;
  }

  const parts = [
    source.type,
    title,
    company,
    position,
    startDate,
  ].filter(Boolean);

  return parts.join('|');
}

function pickPreferredSource(
  current: RepositorySource,
  candidate: RepositorySource,
): RepositorySource {
  if (current.sendable !== candidate.sendable) {
    return candidate.sendable ? candidate : current;
  }

  if (current.kind !== candidate.kind) {
    return candidate.kind === 'ongoing' ? candidate : current;
  }

  return candidate.freewrite.length > current.freewrite.length ? candidate : current;
}

export function dedupeRepositorySources(
  sources: RepositorySource[],
): RepositorySource[] {
  const byIdentity = new Map<string, RepositorySource>();

  for (const source of sources) {
    const key = sourceIdentityKey(source);
    const existing = byIdentity.get(key);
    byIdentity.set(
      key,
      existing ? pickPreferredSource(existing, source) : source,
    );
  }

  return [...byIdentity.values()];
}

export function estimateSourceMaterialTokens(sources: RepositorySource[]) {
  const text = sources.map((source) => source.freewrite).join('\n\n');
  return Math.ceil(text.trim().length / 4);
}

export async function fetchRepositorySources(): Promise<{
  repo: RepositorySource[];
  ongoing: RepositorySource[];
  repoRaw: RepoItem[];
  ongoingRaw: OngoingItem[];
}> {
  const [repoRes, ongoingRes] = await Promise.all([
    fetch('/api/repo'),
    fetch('/api/ongoing'),
  ]);

  if (!repoRes.ok || !ongoingRes.ok) {
    throw new Error(
      'Could not load repository data. Make sure the API server is running (npm run dev).',
    );
  }

  const repoRaw = (await repoRes.json()) as RepoItem[];
  const ongoingRaw = (await ongoingRes.json()) as OngoingItem[];

  return {
    repoRaw,
    ongoingRaw,
    repo: repoRaw.map(repoItemToSource),
    ongoing: ongoingRaw.map(ongoingItemToSource),
  };
}

export function sourceLabel(source: RepositorySource) {
  const org = source.company ? ` · ${source.company}` : '';
  const kind = source.kind === 'ongoing' ? 'ongoing' : 'repo';
  const status =
    source.kind === 'ongoing' && source.status === 'active' ? ' · active' : '';
  return `[${kind}${status}] ${source.title}${org}`;
}
