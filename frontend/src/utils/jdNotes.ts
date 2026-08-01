import type { ResumeData } from '../types/resume';
import type { CoverLetterData } from '../types/coverLetter';

export interface JdNote {
  id: string;
  label: string;
  comment: string;
}

/** Collect all JD match notes with stable anchor ids for sidebar arrows. */
export function collectJdNotes(data: ResumeData): JdNote[] {
  const notes: JdNote[] = [];

  for (const section of data.sections) {
    if (section.jdComment?.trim()) {
      notes.push({
        id: `section-${section.id}`,
        label: section.title,
        comment: section.jdComment.trim(),
      });
    }

    if (section.type === 'skills' && section.skills) {
      for (const skill of section.skills) {
        if (skill.jdComment?.trim()) {
          notes.push({
            id: `skill-${section.id}-${skill.id}`,
            label: `${section.title} · ${skill.label}`,
            comment: skill.jdComment.trim(),
          });
        }
      }
    } else {
      for (const entry of section.entries) {
        if (entry.jdComment?.trim()) {
          notes.push({
            id: `entry-${entry.id}`,
            label: `${section.title} · ${entry.title}`,
            comment: entry.jdComment.trim(),
          });
        }

        entry.bullets.forEach((bullet, idx) => {
          if (bullet.jdComment?.trim()) {
            notes.push({
              id: `bullet-${section.id}-${entry.id}-${idx}`,
              label: `${section.title} · ${entry.title} · Bullet ${idx + 1}`,
              comment: bullet.jdComment.trim(),
            });
          }
        });
      }
    }
  }

  return notes;
}

export function resumeHasJdNotes(data: ResumeData): boolean {
  return collectJdNotes(data).length > 0;
}

/**
 * Same shape as the resume's notes so `JdNotesPanel` renders both unchanged.
 * Anchor ids are prefixed `cl-paragraph-` and keyed by paragraph id, since a
 * letter has no sections or entries to qualify them with.
 */
export function collectCoverLetterJdNotes(data: CoverLetterData): JdNote[] {
  return data.paragraphs.flatMap((paragraph, index) =>
    paragraph.jdComment?.trim()
      ? [
          {
            id: `cl-paragraph-${paragraph.id}`,
            label: `Paragraph ${index + 1}`,
            comment: paragraph.jdComment.trim(),
          },
        ]
      : [],
  );
}

export function coverLetterHasJdNotes(data: CoverLetterData): boolean {
  return collectCoverLetterJdNotes(data).length > 0;
}
