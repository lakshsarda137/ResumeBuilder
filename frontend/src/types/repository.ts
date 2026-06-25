export type RepoMode = 'optimized' | 'freewrite';
export type ItemType = 'experience' | 'project';

export interface RepoItem {
  id: string;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  mode: RepoMode;
  content: string;
  created_at: string;
  updated_at?: string;
}

export interface Reflection {
  id: string;
  ongoing_item_id: string;
  content: string;
  created_at: string;
}

export interface OngoingItem {
  id: string;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  status: 'active' | 'done';
  end_date: string | null;
  compiled: string | null;
  created_at: string;
  updated_at?: string;
  reflections: Reflection[];
}

export type SourceKind = 'repo' | 'ongoing';

export interface RepositorySource {
  id: string;
  kind: SourceKind;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  end_date: string | null;
  freewrite: string;
  /** Repo-only: false when mode is optimized (not sent to LLM). */
  sendable: boolean;
  status?: OngoingItem['status'];
}
