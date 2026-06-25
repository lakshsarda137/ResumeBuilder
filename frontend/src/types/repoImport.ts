import type { ItemType } from './repository';

export interface RepoImportEducation {
  school: string;
  degree?: string;
  major?: string;
  grad_date?: string;
  gpa?: string;
  location?: string;
  notes?: string;
}

export interface RepoImportProfile {
  education?: RepoImportEducation[];
  skills_note?: string;
  other_fixed_facts?: string[];
}

export interface RepoImportEntry {
  type: ItemType;
  title: string;
  company?: string | null;
  position?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  freewrite: string;
}

export interface RepoImportPayload {
  source_label?: string;
  profile?: RepoImportProfile;
  entries: RepoImportEntry[];
}

export interface RepoImportMergeResult {
  created: number;
  merged: number;
  skipped: number;
  ongoingCreated: number;
  ongoingUpdated: number;
  ongoingSkipped: number;
  educationCreated: number;
  educationMerged: number;
  educationSkipped: number;
}
