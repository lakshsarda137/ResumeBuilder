import type { AiChatSession } from './aiSession';
import type { ResumeData } from './resume';

/** Full editor state captured when saving a history session. */
export interface HistorySessionSnapshot {
  resume: ResumeData;
  jobDescription: string;
  linkedSession: AiChatSession | null;
  showJdNotes: boolean;
  zoom: number;
  aiUserPrompt: string;
}

export interface HistorySessionListItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface HistorySession extends HistorySessionListItem {
  snapshot: HistorySessionSnapshot;
}
