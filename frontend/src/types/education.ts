export interface EducationItem {
  id: string;
  school: string;
  degree: string | null;
  major: string | null;
  grad_date: string | null;
  gpa: string | null;
  location: string | null;
  coursework: string;
  created_at: string;
  updated_at?: string;
}

export interface EducationMeta {
  skills_note: string;
  other_notes: string;
  updated_at?: string;
}

export interface EducationData {
  items: EducationItem[];
  meta: EducationMeta;
}
