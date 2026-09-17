import type { EducationItem, EducationMeta } from '../types/education';
import type { RepoImportEducation, RepoImportProfile } from '../types/repoImport';

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function educationMatchKey(item: {
  school: string;
  degree?: string | null;
}): string {
  return [normalizeKeyPart(item.school), normalizeKeyPart(item.degree)]
    .filter(Boolean)
    .join('|');
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

function pickText(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const current = existing?.trim();
  if (current) return current;
  const next = incoming?.trim();
  return next || null;
}

function importEducationToCoursework(edu: RepoImportEducation): string {
  return [edu.notes].filter(Boolean).join('\n').trim();
}

export interface EducationImportResult {
  educationCreated: number;
  educationMerged: number;
  educationSkipped: number;
}

export async function syncEducationFromImport(
  profile: RepoImportProfile | undefined,
  sourceLabel: string,
): Promise<EducationImportResult> {
  const res = await fetch('/api/education');
  if (!res.ok) {
    throw new Error('Failed to load education records.');
  }

  const { items: existingItems, meta: existingMeta } = (await res.json()) as {
    items: EducationItem[];
    meta: EducationMeta;
  };

  const byKey = new Map<string, EducationItem>();
  for (const item of existingItems) {
    byKey.set(educationMatchKey(item), item);
  }

  let educationCreated = 0;
  let educationMerged = 0;
  let educationSkipped = 0;

  for (const edu of profile?.education ?? []) {
    if (!edu.school?.trim()) {
      educationSkipped += 1;
      continue;
    }

    const coursework = importEducationToCoursework(edu);
    const key = educationMatchKey({ school: edu.school, degree: edu.degree ?? null });
    const match = byKey.get(key);

    if (match) {
      const nextCoursework =
        coursework && !contentAlreadyIncluded(match.coursework, coursework)
          ? appendImportBlock(match.coursework, coursework, sourceLabel)
          : match.coursework;

      const body = {
        degree: pickText(match.degree, edu.degree ?? null),
        major: pickText(match.major, edu.major ?? null),
        start_date: pickText(match.start_date, edu.start_date ?? null),
        grad_date: pickText(match.grad_date, edu.grad_date ?? null),
        gpa: pickText(match.gpa, edu.gpa ?? null),
        location: pickText(match.location, edu.location ?? null),
        coursework: nextCoursework,
      };

      const unchanged =
        body.degree === match.degree &&
        body.major === match.major &&
        body.start_date === match.start_date &&
        body.grad_date === match.grad_date &&
        body.gpa === match.gpa &&
        body.location === match.location &&
        body.coursework === match.coursework;

      if (unchanged) {
        educationSkipped += 1;
        continue;
      }

      const patchRes = await fetch(`/api/education/${match.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!patchRes.ok) {
        throw new Error('Failed to merge education record during import.');
      }
      educationMerged += 1;
      continue;
    }

    const createRes = await fetch('/api/education', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school: edu.school.trim(),
        degree: edu.degree?.trim() || null,
        major: edu.major?.trim() || null,
        start_date: edu.start_date?.trim() || null,
        grad_date: edu.grad_date?.trim() || null,
        gpa: edu.gpa?.trim() || null,
        location: edu.location?.trim() || null,
        coursework,
      }),
    });
    if (!createRes.ok) {
      throw new Error('Failed to create education record during import.');
    }

    const created = (await createRes.json()) as EducationItem;
    educationCreated += 1;
    byKey.set(key, created);
  }

  const metaUpdates: Partial<EducationMeta> = {};
  let nextSkills = existingMeta.skills_note ?? '';
  let nextOther = existingMeta.other_notes ?? '';

  if (profile?.skills_note?.trim()) {
    const block = profile.skills_note.trim();
    if (!contentAlreadyIncluded(nextSkills, block)) {
      nextSkills = appendImportBlock(nextSkills, block, sourceLabel);
    }
  }

  const otherBlocks = (profile?.other_fixed_facts ?? []).filter(Boolean);
  if (otherBlocks.length > 0) {
    const block = otherBlocks.join('\n');
    if (!contentAlreadyIncluded(nextOther, block)) {
      nextOther = appendImportBlock(nextOther, block, sourceLabel);
    }
  }

  if (nextSkills !== existingMeta.skills_note) {
    metaUpdates.skills_note = nextSkills;
  }
  if (nextOther !== existingMeta.other_notes) {
    metaUpdates.other_notes = nextOther;
  }

  if (Object.keys(metaUpdates).length > 0) {
    const metaRes = await fetch('/api/education/meta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaUpdates),
    });
    if (!metaRes.ok) {
      throw new Error('Failed to update education skills/notes during import.');
    }
    if (metaUpdates.skills_note && !metaUpdates.other_notes) {
      educationMerged += 1;
    } else if (metaUpdates.other_notes && !metaUpdates.skills_note) {
      educationMerged += 1;
    } else if (metaUpdates.skills_note && metaUpdates.other_notes) {
      educationMerged += 1;
    }
  }

  return { educationCreated, educationMerged, educationSkipped };
}
