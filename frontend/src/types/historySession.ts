import type { AiChatSession } from './aiSession';
import type { ResumeData } from './resume';
import type { CouncilSnapshot } from './council';
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
  /** Present when the resume was built via an LLM Council run. */
  council?: CouncilSnapshot | null;
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
