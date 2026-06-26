import type { AiChatSession } from './aiSession';
import type { ResumeData } from './resume';
import type { ResumeRenderSettings } from '../utils/resumeSettings';

/** Full editor state captured when saving a history session. */
export interface HistorySessionSnapshot {
  resume: ResumeData;
  jobDescription: string;
  linkedSession: AiChatSession | null;
  showJdNotes: boolean;
  zoom: number;
  aiUserPrompt: string;
  renderSettings?: ResumeRenderSettings;
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
