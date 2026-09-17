import type { AiChatSession } from './aiSession';
import type { ResumeData } from './resume';
import type { CoverLetterData } from './coverLetter';
import type { CouncilSnapshot } from './council';
import type { ResumeRenderSettings } from '../utils/resumeSettings';
import type { RecruiterReadResult } from '../utils/recruiterRead';

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
  /**
   * Present when this session also built a cover letter alongside the resume.
   * Cover letters are always written by a single model, so there is no council
   * snapshot here. Render settings are derived from `renderSettings` rather
   * than stored, so the letter can never drift from the resume's typography.
   */
  coverLetter?: CoverLetterData | null;
  /** The chat the cover letter was generated in, for reopening it. */
  coverLetterSession?: AiChatSession | null;
  /** Cold 10-second recruiter summary of the resume, when one was run. */
  recruiterRead?: RecruiterReadResult | null;
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
