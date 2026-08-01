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

export type SourceKind = 'repo';

export interface RepositorySource {
  id: string;
  kind: SourceKind;
  type: ItemType;
  title: string;
  company: string | null;
  position: string | null;
  start_date: string | null;
  /** null end_date means the item is ongoing ("Present"). */
  end_date: string | null;
  freewrite: string;
  /** false when mode is optimized (not sent to LLM). */
  sendable: boolean;
}
