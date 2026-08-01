import type { AiProvider } from '../utils/aiProviders';
import type { AiChatSession } from './aiSession';
import type { ResumeData } from './resume';

/** Anonymized candidate label shown to the judge — never a provider name. */
export type CandidateLabel = 'A' | 'B' | 'C';

export const CANDIDATE_LABELS: CandidateLabel[] = ['A', 'B', 'C'];

export type CouncilSlotRole = 'candidate' | 'judge';

/**
 * Coarse, app-driven lifecycle for a single council slot. The extension capture
 * logic is untouched, so these statuses are derived from the orchestration
 * lifecycle (start → in-flight → settle) rather than provider-tab micro-steps.
 */
export type CouncilSlotStatus =
  | 'waiting'
  | 'configuring'
  | 'generating'
  | 'parsing'
  | 'done'
  | 'failed';

export interface CouncilSlotState {
  slotId: string;
  role: CouncilSlotRole;
  provider: AiProvider;
  /** Short row label, e.g. "Candidate 1" or "Judge". */
  title: string;
  status: CouncilSlotStatus;
  /** Revealed only after the judge completes (candidate slots). */
  label?: CandidateLabel;
  error?: string;
}

/** A successful candidate generation. */
export interface CouncilCandidateResult {
  slotId: string;
  provider: AiProvider;
  label: CandidateLabel;
  /** Repository path: generated resume. Optimize path: optimized resume. */
  resume: ResumeData;
  /** Optimize path only: the candidate's faithful baseline extraction. */
  baseline: ResumeData | null;
  rawResponse: string;
  session: AiChatSession | null;
}

export interface CouncilCandidateFailure {
  slotId: string;
  provider: AiProvider;
  error: string;
}

/**
 * The judge's verdict on one candidate: a single ATS score out of 100 and a
 * short plain-prose justification. Replaced a multi-dimension rubric whose
 * per-dimension rationales consumed most of the judge's output budget before it
 * reached the resume it actually ships.
 */
export interface CandidateAtsScore {
  atsScore: number | null;
  justification: string;
}

export interface CouncilJudgeResult {
  /** Keyed by anonymized candidate label (A/B/C). */
  scores: Record<string, CandidateAtsScore>;
  synthesisNotes: string;
  /** Merged best-of-all-worlds resume. */
  final: ResumeData;
  /** Optimize path: baseline used for the final diff (from a candidate). */
  finalBaseline: ResumeData | null;
  rawResponse: string;
  session: AiChatSession | null;
}

export type CouncilPath = 'repository' | 'optimize';

/** Full outcome of a council run, held in the wizard while the modal is open. */
export interface CouncilRunResult {
  path: CouncilPath;
  candidates: CouncilCandidateResult[];
  failures: CouncilCandidateFailure[];
  judge: CouncilJudgeResult | null;
  judgeError: string | null;
  judgeProvider: AiProvider;
  /** Whether a job description was supplied for this run. */
  hadJobDescription: boolean;
}

/** Persisted in a history session snapshot when a council build is applied. */
export interface CouncilSnapshot {
  mode: 'council';
  providers: {
    candidates: AiProvider[];
    judge: AiProvider;
  };
  candidateOutputs: Array<{
    provider: AiProvider;
    label: CandidateLabel;
    resume: ResumeData;
  }>;
  judgeOutput: {
    synthesisNotes: string;
    scores: Record<string, CandidateAtsScore>;
  } | null;
  failures: CouncilCandidateFailure[];
}
