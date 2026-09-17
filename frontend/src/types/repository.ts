import type { EntryLink } from './resume';

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
  /** Optional code-repository link, hyperlinked on the resume. */
  github_url?: string | null;
  /** Anchor text for github_url; defaults to "GitHub". */
  github_label?: string | null;
  /** Optional live site / demo link, hyperlinked on the resume. */
  website_url?: string | null;
  /** Anchor text for website_url; defaults to "Website" (e.g. "Play Online"). */
  website_label?: string | null;
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
  /** Hyperlinks from the repo item (GitHub / website), already normalized. */
  links: EntryLink[];
  /** false when mode is optimized (not sent to LLM). */
  sendable: boolean;
}
