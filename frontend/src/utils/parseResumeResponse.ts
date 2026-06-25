import type {
  ResumeData,
  ResumeBullet,
  ResumeEntry,
  ResumeSection,
  SkillCategory,
} from '../types/resume';
import { makeBullet } from '../types/resume';
import { migrateResumeData } from './migrateResume';

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function repairJson(json: string): string {
  return json
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function extractJsonCandidate(text: string): string {
  const fencedBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fencedBlocks.length > 0) {
    return fencedBlocks[fencedBlocks.length - 1][1].trim();
  }

  const fenced = text.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }

  throw new Error(
    'LLM response did not include a JSON code block. Ask it to return ```json with the full resume.',
  );
}

function normalizeBullet(raw: unknown, index: number): ResumeBullet {
  if (typeof raw === 'string') {
    return makeBullet(raw);
  }

  if (raw && typeof raw === 'object') {
    const bullet = raw as { text?: unknown; jdComment?: unknown };
    const text =
      typeof bullet.text === 'string'
        ? bullet.text
        : typeof (raw as { value?: unknown }).value === 'string'
          ? ((raw as { value: string }).value as string)
          : `Bullet ${index + 1}`;
    const jdComment =
      typeof bullet.jdComment === 'string' && bullet.jdComment.trim()
        ? bullet.jdComment.trim()
        : undefined;
    return makeBullet(text, jdComment);
  }

  return makeBullet(`Bullet ${index + 1}`);
}

function normalizeEntry(raw: Partial<ResumeEntry>, index: number): ResumeEntry {
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets.map((bullet, bulletIndex) =>
        normalizeBullet(bullet, bulletIndex),
      )
    : [];

  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : generateId(`entry-${index}`),
    title: typeof raw.title === 'string' ? raw.title : 'Title',
    location: typeof raw.location === 'string' ? raw.location : '',
    date: typeof raw.date === 'string' ? raw.date : '',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    bullets,
    jdComment,
  };
}

function normalizeSkill(raw: Partial<SkillCategory>, index: number): SkillCategory {
  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : generateId(`skill-${index}`),
    label: typeof raw.label === 'string' ? raw.label : 'Category',
    items: typeof raw.items === 'string' ? raw.items : '',
    jdComment,
  };
}

function normalizeSection(
  raw: Partial<ResumeSection>,
  index: number,
  fallback?: ResumeSection,
): ResumeSection {
  const type =
    raw.type === 'education' ||
    raw.type === 'experience' ||
    raw.type === 'projects' ||
    raw.type === 'skills' ||
    raw.type === 'custom'
      ? raw.type
      : fallback?.type ?? 'custom';

  const entries = Array.isArray(raw.entries)
    ? raw.entries.map((entry, entryIndex) =>
        normalizeEntry(entry as Partial<ResumeEntry>, entryIndex),
      )
    : fallback?.entries ?? [];

  const skills = Array.isArray(raw.skills)
    ? raw.skills.map((skill, skillIndex) =>
        normalizeSkill(skill as Partial<SkillCategory>, skillIndex),
      )
    : fallback?.skills;

  const jdComment =
    typeof raw.jdComment === 'string' && raw.jdComment.trim()
      ? raw.jdComment.trim()
      : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : fallback?.id ?? generateId(`section-${index}`),
    type,
    title:
      typeof raw.title === 'string'
        ? raw.title
        : fallback?.title ?? 'Section',
    entries: type === 'skills' ? [] : entries,
    skills: type === 'skills' ? skills ?? fallback?.skills ?? [] : skills,
    jdComment,
  };
}

export function normalizeAiResume(
  raw: unknown,
  fallback: ResumeData,
): ResumeData {
  const migrated = migrateResumeData(raw);
  const source = migrated.contact && migrated.sections ? migrated : fallback;

  const contact = {
    name:
      typeof source.contact?.name === 'string' && source.contact.name.trim()
        ? source.contact.name
        : fallback.contact.name,
    links:
      Array.isArray(source.contact?.links) && source.contact.links.length > 0
        ? source.contact.links.map((link, index) => ({
            id:
              typeof link.id === 'string'
                ? link.id
                : fallback.contact.links[index]?.id ?? generateId(`link-${index}`),
            value: typeof link.value === 'string' ? link.value : '',
          }))
        : fallback.contact.links,
  };

  const sections =
    Array.isArray(source.sections) && source.sections.length > 0
      ? source.sections.map((section, index) =>
          normalizeSection(
            section as Partial<ResumeSection>,
            index,
            fallback.sections[index],
          ),
        )
      : fallback.sections;

  return { contact, sections };
}

const IMPORT_BASELINE: ResumeData = {
  contact: { name: '', links: [] },
  sections: [],
};

export function parseImportedResume(rawResponse: string): ResumeData {
  return parseResumeFromLlmResponse(rawResponse, IMPORT_BASELINE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseOptimizedPdfResponse(rawResponse: string): {
  baseline: ResumeData;
  optimized: ResumeData;
} {
  const candidate = extractJsonCandidate(rawResponse);
  let parsed: unknown;

  try {
    parsed = JSON.parse(repairJson(candidate));
  } catch {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new Error(
        'LLM returned invalid JSON. Open the linked chat, confirm the full ```json block finished, then try again.',
      );
    }
  }

  if (
    isRecord(parsed) &&
    isRecord(parsed.baseline) &&
    isRecord(parsed.optimized)
  ) {
    const baseline = normalizeAiResume(parsed.baseline, IMPORT_BASELINE);
    const optimized = normalizeAiResume(parsed.optimized, baseline);
    return { baseline, optimized };
  }

  const optimized = normalizeAiResume(parsed, IMPORT_BASELINE);
  return {
    baseline: IMPORT_BASELINE,
    optimized,
  };
}

export function parseResumeFromLlmResponse(
  rawResponse: string,
  fallback: ResumeData,
): ResumeData {
  const candidate = extractJsonCandidate(rawResponse);
  let parsed: unknown;

  try {
    parsed = JSON.parse(repairJson(candidate));
  } catch {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new Error(
        'LLM returned invalid JSON. Open the linked chat, confirm the full ```json block finished, then try again.',
      );
    }
  }

  return normalizeAiResume(parsed, fallback);
}

function bulletTexts(bullets: ResumeBullet[]) {
  return bullets.map((bullet) => bullet.text);
}

function truncate(text: string, max = 72) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function summarizeBulletChanges(
  beforeBullets: ResumeBullet[],
  afterBullets: ResumeBullet[],
  entryLabel: string,
) {
  const changes: string[] = [];
  const maxLength = Math.max(beforeBullets.length, afterBullets.length);

  for (let index = 0; index < maxLength; index += 1) {
    const before = beforeBullets[index]?.text;
    const after = afterBullets[index]?.text;

    if (before === after) {
      continue;
    }

    const bulletNumber = index + 1;

    if (before === undefined && after !== undefined) {
      changes.push(
        `Added bullet ${bulletNumber} in ${entryLabel}: "${truncate(after)}"`,
      );
      continue;
    }

    if (before !== undefined && after === undefined) {
      changes.push(
        `Removed bullet ${bulletNumber} from ${entryLabel}: "${truncate(before)}"`,
      );
      continue;
    }

    if (before !== undefined && after !== undefined) {
      changes.push(
        `Bullet ${bulletNumber} in ${entryLabel}: "${truncate(before)}" → "${truncate(after)}"`,
      );
    }
  }

  return changes;
}

export function summarizeResumeChanges(before: ResumeData, after: ResumeData) {
  const changes: string[] = [];

  if (before.contact.name !== after.contact.name) {
    changes.push(`Name: "${before.contact.name}" → "${after.contact.name}"`);
  }

  if (JSON.stringify(before.contact.links) !== JSON.stringify(after.contact.links)) {
    changes.push('Contact links updated');
  }

  after.sections.forEach((section, index) => {
    const previous = before.sections[index];
    if (!previous) {
      changes.push(`Added section: ${section.title}`);
      return;
    }

    if (previous.title !== section.title) {
      changes.push(`Section renamed: ${previous.title} → ${section.title}`);
    }

    section.entries.forEach((entry, entryIndex) => {
      const prevEntry = previous.entries[entryIndex];
      if (!prevEntry) {
        changes.push(`Added entry in ${section.title}: ${entry.title}`);
        return;
      }

      const entryLabel = `${section.title} · ${entry.title}`;

      if (
        JSON.stringify(bulletTexts(prevEntry.bullets)) !==
        JSON.stringify(bulletTexts(entry.bullets))
      ) {
        changes.push(
          ...summarizeBulletChanges(prevEntry.bullets, entry.bullets, entryLabel),
        );
      }

      if (
        prevEntry.title !== entry.title ||
        prevEntry.subtitle !== entry.subtitle ||
        prevEntry.date !== entry.date ||
        prevEntry.location !== entry.location
      ) {
        changes.push(`Entry metadata updated: ${entryLabel}`);
      }
    });
  });

  return changes.length > 0 ? changes : ['Resume refreshed — review before applying.'];
}
