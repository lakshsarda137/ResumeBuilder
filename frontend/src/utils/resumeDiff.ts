import type { ResumeData } from '../types/resume';
import { bulletText } from '../types/resume';

export type DiffChangeKind = 'added' | 'removed' | 'modified';

export interface ResumeDiffChange {
  id: string;
  kind: DiffChangeKind;
  /** e.g. "Experience · Checkmate" */
  location: string;
  /** e.g. "Bullet 2" */
  label: string;
  before?: string;
  after?: string;
  /** AI commentary — explicitly NOT printed on the resume */
  aiNote?: string;
  sortKey?: string;
}

interface FlatItem {
  sortKey: string;
  location: string;
  label: string;
  text: string;
  aiNote?: string;
  itemType?: 'field' | 'bullet';
  groupKey?: string;
  index?: number;
}

interface KeyedFlatItem extends FlatItem {
  key: string;
}

const BULLET_MATCH_THRESHOLD = 0.42;

function normalizeDiffText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9%$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeDiffText(value)
      .split(' ')
      .filter((token) => token.length > 2 || /\d/.test(token)),
  );
}

function textSimilarity(a: string, b: string): number {
  const left = normalizeDiffText(a);
  const right = normalizeDiffText(b);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.72;
  }

  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  });

  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

/**
 * Flatten resume using stable section/entry/skill/link ids — NOT array indices.
 * Reordering sections or entries must not produce false "replaced" diffs.
 */
function flattenResume(data: ResumeData): Map<string, FlatItem> {
  const map = new Map<string, FlatItem>();

  map.set('contact/name', {
    sortKey: '00-contact-name',
    location: 'Contact',
    label: 'Name',
    text: data.contact.name,
  });

  data.contact.links.forEach((link, index) => {
    map.set(`contact/link/${link.id}`, {
      sortKey: `01-contact-link-${String(index).padStart(3, '0')}-${link.id}`,
      location: 'Contact',
      label: 'Link',
      text: link.value,
    });
  });

  data.sections.forEach((section, sectionIndex) => {
    const sectionOrder = String(sectionIndex).padStart(3, '0');
    const sectionBase = `section/${section.id}`;

    map.set(`${sectionBase}/title`, {
      sortKey: `${sectionOrder}-${sectionBase}-title`,
      location: section.title,
      label: 'Section heading',
      text: section.title,
    });

    if (section.jdComment?.trim()) {
      map.set(`${sectionBase}/jd`, {
        sortKey: `${sectionOrder}-${sectionBase}-jd`,
        location: section.title,
        label: 'AI note',
        text: '',
        aiNote: section.jdComment.trim(),
      });
    }

    section.entries.forEach((entry, entryIndex) => {
      const entryOrder = String(entryIndex).padStart(3, '0');
      const entryBase = `${sectionBase}/entry/${entry.id}`;
      const loc = `${section.title} · ${entry.title}`;

      const scalarFields: Array<[string, string, string]> = [
        ['title', 'Title', entry.title],
        ['subtitle', 'Role / subtitle', entry.subtitle],
        ['date', 'Date', entry.date],
        ['location', 'Location', entry.location],
      ];

      for (const [field, fieldLabel, value] of scalarFields) {
        if (!value.trim()) {
          continue;
        }
        map.set(`${entryBase}/${field}`, {
          sortKey: `${sectionOrder}-${entryOrder}-${entry.id}-${field}`,
          location: loc,
          label: fieldLabel,
          text: value,
        });
      }

      if (entry.jdComment?.trim()) {
        map.set(`${entryBase}/jd`, {
          sortKey: `${sectionOrder}-${entryOrder}-${entry.id}-jd`,
          location: loc,
          label: 'AI note',
          text: '',
          aiNote: entry.jdComment.trim(),
        });
      }

      entry.bullets.forEach((bullet, bulletIndex) => {
        const text = bulletText(bullet).trim();
        if (!text && !bullet.jdComment?.trim()) {
          return;
        }
        map.set(`${entryBase}/bullet/${bulletIndex}`, {
          sortKey: `${sectionOrder}-${entryOrder}-${entry.id}-bullet-${String(bulletIndex).padStart(3, '0')}`,
          location: loc,
          label: `Bullet ${bulletIndex + 1}`,
          text,
          aiNote: bullet.jdComment?.trim(),
          itemType: 'bullet',
          groupKey: entryBase,
          index: bulletIndex,
        });
      });
    });

    section.skills?.forEach((skill, skillIndex) => {
      const skillOrder = String(skillIndex).padStart(3, '0');
      const skillBase = `${sectionBase}/skill/${skill.id}`;
      const loc = section.title;

      if (skill.label.trim() || skill.items.trim()) {
        map.set(`${skillBase}/items`, {
          sortKey: `${sectionOrder}-${skillOrder}-${skill.id}-items`,
          location: loc,
          label: skill.label.trim() || 'Skills',
          text: skill.items.trim(),
        });
      }

      if (skill.jdComment?.trim()) {
        map.set(`${skillBase}/jd`, {
          sortKey: `${sectionOrder}-${skillOrder}-${skill.id}-jd`,
          location: loc,
          label: `${skill.label || 'Skills'} — AI note`,
          text: '',
          aiNote: skill.jdComment.trim(),
        });
      }
    });
  });

  return map;
}

function collectBulletGroups(flatMap: Map<string, FlatItem>): Map<string, KeyedFlatItem[]> {
  const groups = new Map<string, KeyedFlatItem[]>();

  flatMap.forEach((item, key) => {
    if (item.itemType !== 'bullet' || !item.groupKey) {
      return;
    }

    const group = groups.get(item.groupKey) ?? [];
    group.push({ ...item, key });
    groups.set(item.groupKey, group);
  });

  groups.forEach((items) => {
    items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  });

  return groups;
}

function buildBulletDiffChanges(
  beforeMap: Map<string, FlatItem>,
  afterMap: Map<string, FlatItem>,
): ResumeDiffChange[] {
  const beforeGroups = collectBulletGroups(beforeMap);
  const afterGroups = collectBulletGroups(afterMap);
  const groupKeys = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
  const changes: ResumeDiffChange[] = [];

  groupKeys.forEach((groupKey) => {
    const before = beforeGroups.get(groupKey) ?? [];
    const after = afterGroups.get(groupKey) ?? [];
    const matchedAfter = new Set<number>();

    before.forEach((prev) => {
      let bestIndex = -1;
      let bestScore = 0;

      after.forEach((next, nextIndex) => {
        if (matchedAfter.has(nextIndex)) {
          return;
        }

        const score = textSimilarity(prev.text, next.text);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = nextIndex;
        }
      });

      if (bestIndex !== -1 && bestScore >= BULLET_MATCH_THRESHOLD) {
        const next = after[bestIndex];
        matchedAfter.add(bestIndex);

        const prevText = prev.text.trim();
        const nextText = next.text.trim();
        const prevNote = prev.aiNote?.trim();
        const nextNote = next.aiNote?.trim();

        if (prevText !== nextText || prevNote !== nextNote) {
          changes.push({
            id: `${groupKey}/bullet/${prev.index ?? 0}-${next.index ?? 0}`,
            kind: 'modified',
            location: next.location || prev.location,
            label:
              prev.index === next.index
                ? next.label
                : `${prev.label} → ${next.label}`,
            before: prevText,
            after: nextText,
            aiNote: nextNote,
            sortKey: next.sortKey || prev.sortKey,
          });
        }
        return;
      }

      changes.push({
        id: prev.key,
        kind: 'removed',
        location: prev.location,
        label: prev.label,
        before: prev.text.trim(),
        aiNote: prev.aiNote?.trim(),
        sortKey: prev.sortKey,
      });
    });

    after.forEach((next, nextIndex) => {
      if (matchedAfter.has(nextIndex)) {
        return;
      }

      changes.push({
        id: next.key,
        kind: 'added',
        location: next.location,
        label: next.label,
        after: next.text.trim(),
        aiNote: next.aiNote?.trim(),
        sortKey: next.sortKey,
      });
    });
  });

  return changes;
}

export function computeResumeDiff(
  before: ResumeData,
  after: ResumeData,
): ResumeDiffChange[] {
  const beforeMap = flattenResume(before);
  const afterMap = flattenResume(after);
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changes: ResumeDiffChange[] = [];

  for (const key of keys) {
    const prev = beforeMap.get(key);
    const next = afterMap.get(key);

    if (prev?.itemType === 'bullet' || next?.itemType === 'bullet') {
      continue;
    }

    const location = next?.location ?? prev?.location ?? 'Resume';
    const label = next?.label ?? prev?.label ?? 'Field';

    const prevText = prev?.text?.trim() ?? '';
    const nextText = next?.text?.trim() ?? '';
    const prevNote = prev?.aiNote?.trim();
    const nextNote = next?.aiNote?.trim();

    const textSame = prevText === nextText;
    const noteSame = prevNote === nextNote;

    if (textSame && noteSame) {
      continue;
    }

    if (!prevText && !nextText && (prevNote || nextNote)) {
      if (prevNote && nextNote && prevNote !== nextNote) {
        changes.push({
          id: key,
          kind: 'modified',
          location,
          label,
          before: prevNote,
          after: nextNote,
          aiNote: nextNote,
        });
      } else if (nextNote && !prevNote) {
        changes.push({
          id: key,
          kind: 'added',
          location,
          label,
          aiNote: nextNote,
        });
      } else if (prevNote && !nextNote) {
        changes.push({
          id: key,
          kind: 'removed',
          location,
          label,
          aiNote: prevNote,
        });
      }
      continue;
    }

    if (prevText && nextText && prevText !== nextText) {
      changes.push({
        id: key,
        kind: 'modified',
        location,
        label,
        before: prevText,
        after: nextText,
        aiNote: nextNote,
        sortKey: next?.sortKey ?? prev?.sortKey,
      });
      continue;
    }

    if (!prevText && nextText) {
      changes.push({
        id: key,
        kind: 'added',
        location,
        label,
        after: nextText,
        aiNote: nextNote,
        sortKey: next?.sortKey,
      });
      continue;
    }

    if (prevText && !nextText) {
      changes.push({
        id: key,
        kind: 'removed',
        location,
        label,
        before: prevText,
        aiNote: prevNote,
        sortKey: prev?.sortKey,
      });
    }
  }

  changes.push(...buildBulletDiffChanges(beforeMap, afterMap));

  return changes.sort((a, b) => {
    const aKey =
      a.sortKey ?? afterMap.get(a.id)?.sortKey ?? beforeMap.get(a.id)?.sortKey ?? a.id;
    const bKey =
      b.sortKey ?? afterMap.get(b.id)?.sortKey ?? beforeMap.get(b.id)?.sortKey ?? b.id;
    return aKey.localeCompare(bKey);
  });
}

export function countDiffChanges(changes: ResumeDiffChange[]) {
  return {
    added: changes.filter((c) => c.kind === 'added').length,
    removed: changes.filter((c) => c.kind === 'removed').length,
    modified: changes.filter((c) => c.kind === 'modified').length,
  };
}
