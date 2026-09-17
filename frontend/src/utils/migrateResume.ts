import { normalizeEntryLinks } from './resumeLinks';
import type { ResumeBullet, ResumeData, ResumeEntry, ResumeSection } from '../types/resume';
import { makeBullet } from '../types/resume';
import { defaultResume } from '../data/defaultResume';

function migrateBullets(raw: unknown): ResumeBullet[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((bullet) => {
    if (typeof bullet === 'string') {
      return makeBullet(bullet);
    }
    if (bullet && typeof bullet === 'object' && 'text' in bullet) {
      const value = bullet as { text?: unknown; jdComment?: unknown };
      return makeBullet(
        typeof value.text === 'string' ? value.text : '',
        typeof value.jdComment === 'string' ? value.jdComment : undefined,
      );
    }
    return makeBullet('');
  });
}

function migrateEntry(raw: unknown): ResumeEntry {
  const entry = raw as Partial<ResumeEntry>;
  return {
    id: typeof entry.id === 'string' ? entry.id : `entry-${Date.now()}`,
    title: typeof entry.title === 'string' ? entry.title : '',
    location: typeof entry.location === 'string' ? entry.location : '',
    date: typeof entry.date === 'string' ? entry.date : '',
    subtitle: typeof entry.subtitle === 'string' ? entry.subtitle : '',
    ...(typeof entry.titleNote === 'string' && entry.titleNote.trim()
      ? { titleNote: entry.titleNote }
      : {}),
    bullets: migrateBullets(entry.bullets),
    ...(() => {
      const legacyUrl = (entry as { url?: unknown }).url;
      const links = normalizeEntryLinks([
        ...(Array.isArray(entry.links) ? entry.links : []),
        ...(typeof legacyUrl === 'string' ? [{ url: legacyUrl }] : []),
      ]);
      return links.length > 0 ? { links } : {};
    })(),
    jdComment: typeof entry.jdComment === 'string' ? entry.jdComment : undefined,
  };
}

function migrateSection(raw: unknown): ResumeSection {
  const section = raw as Partial<ResumeSection>;
  return {
    id: typeof section.id === 'string' ? section.id : `section-${Date.now()}`,
    type:
      section.type === 'education' ||
      section.type === 'experience' ||
      section.type === 'projects' ||
      section.type === 'skills' ||
      section.type === 'custom'
        ? section.type
        : 'custom',
    title: typeof section.title === 'string' ? section.title : 'Section',
    entries: Array.isArray(section.entries)
      ? section.entries.map(migrateEntry)
      : [],
    skills: Array.isArray(section.skills) ? section.skills : undefined,
    jdComment: typeof section.jdComment === 'string' ? section.jdComment : undefined,
  };
}

export function migrateResumeData(raw: unknown): ResumeData {
  if (!raw || typeof raw !== 'object') {
    return defaultResume;
  }

  const data = raw as Partial<ResumeData> & {
    contact?: Partial<ResumeData['contact']> & {
      email?: string;
      phone?: string;
      location?: string;
      linkedin?: string;
    };
  };

  if (!data.contact || !Array.isArray(data.sections)) {
    return defaultResume;
  }

  const sections = data.sections.map(migrateSection);

  if (Array.isArray(data.contact.links)) {
    return {
      contact: {
        name: data.contact.name ?? defaultResume.contact.name,
        links: data.contact.links,
      },
      sections,
    };
  }

  const legacy = data.contact;
  const links = [
    legacy.email,
    legacy.phone,
    legacy.location,
    legacy.linkedin,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value, index) => ({
      id: `link-${index}`,
      value,
    }));

  return {
    contact: {
      name: legacy.name ?? defaultResume.contact.name,
      links: links.length > 0 ? links : defaultResume.contact.links,
    },
    sections,
  };
}
