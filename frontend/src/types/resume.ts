export interface ContactLink {
  id: string;
  value: string;
  /**
   * Anchor text shown in place of `value` (e.g. "LinkedIn"), so the header
   * carries the word rather than the full URL. `value` stays the link target.
   */
  label?: string;
}

export interface ContactInfo {
  name: string;
  links: ContactLink[];
}

export interface ResumeBullet {
  text: string;
  jdComment?: string;
}

/**
 * A hyperlink shown after an entry's title ("Title | GitHub | Play Online").
 * `label` is the anchor text; `url` is the absolute https href.
 */
export interface EntryLink {
  label: string;
  url: string;
}

export interface ResumeEntry {
  id: string;
  title: string;
  location: string;
  date: string;
  subtitle: string;
  /**
   * Unbolded note on the top line right after the title, e.g. the accelerator
   * a startup was selected for ("Acme Labs | LaunchPad Accelerator ...").
   */
  titleNote?: string;
  bullets: ResumeBullet[];
  /**
   * Hyperlinks rendered after the title, separated by " | " (e.g. a project's
   * GitHub repo and live demo). Each becomes an anchor and a clickable link
   * annotation in the exported PDF.
   */
  links?: EntryLink[];
  /** How this entry overall matches the job description. */
  jdComment?: string;
}

export interface SkillCategory {
  id: string;
  label: string;
  items: string;
  jdComment?: string;
}

export type SectionType = 'education' | 'experience' | 'projects' | 'skills' | 'custom';

export interface ResumeSection {
  id: string;
  type: SectionType;
  title: string;
  entries: ResumeEntry[];
  skills?: SkillCategory[];
  jdComment?: string;
}

export interface ResumeData {
  contact: ContactInfo;
  sections: ResumeSection[];
}

export function bulletText(bullet: ResumeBullet): string {
  return bullet.text;
}

export function makeBullet(text: string, jdComment?: string): ResumeBullet {
  return jdComment ? { text, jdComment } : { text };
}
