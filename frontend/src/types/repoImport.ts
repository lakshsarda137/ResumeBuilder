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
  merge_target_id?: string | null;
  type: ItemType;
  title: string;
  company?: string | null;
  position?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  freewrite: string;
}

export interface RepoImportResolutionEntry {
  type?: ItemType;
  title?: string;
  company?: string | null;
  position?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  freewrite?: string;
}

export interface RepoImportPayload {
  source_label?: string;
  profile?: RepoImportProfile;
  entries: RepoImportEntry[];
  contradictions?: RepoImportContradiction[];
}

export interface RepoImportContradiction {
  category: 'education' | 'repository' | 'profile' | 'other';
  field?: string;
  existing_id?: string | null;
  incoming_index?: number | string | null;
  existing_value: unknown;
  incoming_value: unknown;
  reason: string;
  resolution_options?: {
    existing?: RepoImportResolutionEntry;
    incoming?: RepoImportResolutionEntry;
  };
}

export interface RepoImportLineDiff {
  kind: 'context' | 'added' | 'removed';
  text: string;
}

export interface RepoImportMergeDiff {
  id: string;
  title: string;
  company?: string | null;
  sourceLabel: string;
  before: string;
  after: string;
  lines: RepoImportLineDiff[];
}

export interface RepoImportMergeResult {
  created: number;
  merged: number;
  skipped: number;
  mergeDiffs: RepoImportMergeDiff[];
  educationCreated: number;
  educationMerged: number;
  educationSkipped: number;
}
