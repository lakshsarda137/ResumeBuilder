export interface ContactLink {
  id: string;
  value: string;
}

export interface ContactInfo {
  name: string;
  links: ContactLink[];
}

export interface ResumeBullet {
  text: string;
  jdComment?: string;
}

export interface ResumeEntry {
  id: string;
  title: string;
  location: string;
  date: string;
  subtitle: string;
  bullets: ResumeBullet[];
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
