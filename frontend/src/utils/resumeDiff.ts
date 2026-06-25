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
}

interface FlatItem {
  sortKey: string;
  location: string;
  label: string;
  text: string;
  aiNote?: string;
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
      });
    }
  }

  return changes.sort((a, b) => {
    const aKey = afterMap.get(a.id)?.sortKey ?? beforeMap.get(a.id)?.sortKey ?? a.id;
    const bKey = afterMap.get(b.id)?.sortKey ?? beforeMap.get(b.id)?.sortKey ?? b.id;
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
