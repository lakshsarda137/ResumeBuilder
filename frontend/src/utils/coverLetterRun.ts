/**
 * Cover letter generation — one model, one send, always after the final resume.
 *
 * There is deliberately no council here. A cover letter is short enough that
 * three drafts plus a judge would cost more than it returns, and the judge's
 * synthesis step is exactly the thing that flattens a letter's voice into the
 * average of three, which is the opposite of what this letter needs to be.
 *
 * The send goes through `sendLargePromptAndWait`, so Gemini gets the task as a
 * .txt attachment via the CDP file-chooser path rather than a paste its
 * composer would silently truncate. The prompt carries the whole resume plus
 * the freewrite warehouse, so it is comfortably in the size range where that
 * matters. See `promptDelivery.ts` and `next_steps.md`.
 */
import type { AiProvider } from './aiProviders';
import type { AiChatSession } from '../types/aiSession';
import type { ResumeData } from '../types/resume';
import type { RepositorySource } from '../types/repository';
import type { EducationData } from '../types/education';
import type { CoverLetterData } from '../types/coverLetter';
import type { BridgeResponse } from '../hooks/useAiBridge';
import { sendLargePromptAndWait, type LargePromptSenders } from './promptDelivery';
import { buildCoverLetterPrompt, buildCoverLetterCoverPrompt } from './coverLetterPrompt';
import { parseGeneratedCoverLetter } from './parseCoverLetterResponse';
import { saveAiSession } from './aiSessionStorage';

export const COVER_LETTER_TASK_FILENAME = 'cover-letter-task.txt';

/** Milestones the editor renders while the letter is being written in the background. */
export type CoverLetterRunStatus =
  | 'idle'
  | 'sending'
  | 'generating'
  | 'parsing'
  | 'done'
  | 'failed';

export interface CoverLetterRunState {
  status: CoverLetterRunStatus;
  provider: AiProvider | null;
  error: string | null;
  /** Set when a truncating provider fell back to pasting; the run may still be bad. */
  attachWarning: string | null;
}

export const IDLE_COVER_LETTER_RUN: CoverLetterRunState = {
  status: 'idle',
  provider: null,
  error: null,
  attachWarning: null,
};

/**
 * What the wizard hands to the editor when the user ticked "also write a cover
 * letter". Deliberately carries no resume: the letter is written from the
 * resume that actually gets APPLIED, which for a council run may be a candidate
 * the user swapped in at the last moment rather than the judge's synthesis.
 * The editor supplies it at send time.
 */
export interface CoverLetterRequest {
  provider: AiProvider;
  jobDescription: string;
  sources: RepositorySource[];
  educationData: EducationData | null;
  settingsInstructions: string;
  incognito: boolean;
}

export interface CoverLetterRunOutcome {
  coverLetter: CoverLetterData;
  rawResponse: string;
  session: AiChatSession | null;
}

export interface CoverLetterRunArgs {
  provider: AiProvider;
  jobDescription: string;
  /** The final resume, exactly as applied to the editor. */
  resume: ResumeData;
  /** The same freewrite sources the resume was built from. */
  sources: RepositorySource[];
  educationData?: EducationData;
  settingsInstructions?: string;
  incognito?: boolean;
  senders: LargePromptSenders<BridgeResponse>;
  onStatus?: (status: CoverLetterRunStatus) => void;
  onAttachFailed?: (message: string) => void;
  isCancelled?: () => boolean;
}

export async function runCoverLetterGeneration({
  provider,
  jobDescription,
  resume,
  sources,
  educationData,
  settingsInstructions,
  incognito,
  senders,
  onStatus,
  onAttachFailed,
  isCancelled,
}: CoverLetterRunArgs): Promise<CoverLetterRunOutcome> {
  const prompt = buildCoverLetterPrompt({
    jobDescription,
    resume,
    sources,
    educationData,
    settingsInstructions,
  });

  onStatus?.('sending');

  // App-side heuristic, same as the resume slots: the extension has no "the
  // model started typing" event, so after a fresh chat usually opens we move
  // the label on rather than sitting on "sending" for the whole run.
  let settled = false;
  const generatingTimer = window.setTimeout(() => {
    if (!settled && !isCancelled?.()) {
      onStatus?.('generating');
    }
  }, 5500);

  try {
    const response = await sendLargePromptAndWait({
      provider,
      prompt,
      coverPrompt: buildCoverLetterCoverPrompt(COVER_LETTER_TASK_FILENAME),
      filename: COVER_LETTER_TASK_FILENAME,
      incognito,
      senders,
      onAttachFailed,
    });
    settled = true;

    if (isCancelled?.()) {
      throw new Error('Cancelled.');
    }
    if (!response.rawResponse) {
      throw new Error(response.error ?? 'No response captured.');
    }

    onStatus?.('parsing');
    const coverLetter = parseGeneratedCoverLetter(response.rawResponse);
    const session = response.session ?? null;
    if (session) {
      saveAiSession(session);
    }

    onStatus?.('done');
    return { coverLetter, rawResponse: response.rawResponse, session };
  } catch (error) {
    settled = true;
    onStatus?.('failed');
    throw error instanceof Error ? error : new Error('Cover letter generation failed.');
  } finally {
    window.clearTimeout(generatingTimer);
  }
}
