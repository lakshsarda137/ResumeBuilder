/**
 * Framework-agnostic council / single-model orchestration for ONE job.
 *
 * Mirrors the ResumeBuilderWizard's council flow (candidates in parallel → judge)
 * but only for the repository (freewrite) path, which is all the Bulk builder
 * uses. Slot progress is surfaced through an `onSlot` callback so any UI (the
 * shared CouncilProgress "forking" view) can render live status per job.
 *
 * NOTE: when several jobs run concurrently with the SAME provider, this issues
 * concurrent sends to that provider (one chat tab each). That leans on the
 * extension's request-keyed isolation holding for same-provider concurrency —
 * verify before relying on large concurrent batches.
 */
import type { AiProvider } from './aiProviders';
import type { AiChatSession } from '../types/aiSession';
import type { ResumeData } from '../types/resume';
import type { RepositorySource } from '../types/repository';
import type {
  CouncilSlotState,
  CouncilCandidateResult,
  CouncilCandidateFailure,
  CouncilJudgeResult,
  CouncilSnapshot,
} from '../types/council';
import { CANDIDATE_LABELS } from '../types/council';
import {
  buildCouncilJudgePrompt,
  buildCouncilJudgeCoverPrompt,
  buildResumeBuildCoverPrompt,
} from './aiPrompt';
import { sendLargePromptAndWait } from './promptDelivery';
import {
  parseStrictGeneratedResume,
  parseCouncilJudgeResponse,
} from './parseResumeResponse';
import { saveAiSession } from './aiSessionStorage';
import type { BridgeResponse } from '../hooks/useAiBridge';

export interface CouncilRunConfig {
  genMode: 'solitary' | 'council';
  provider: AiProvider;
  candidateProviders: AiProvider[];
  judgeProvider: AiProvider;
}

export interface CouncilSenders {
  sendPromptAndWait: (args: {
    provider: AiProvider;
    prompt: string;
  }) => Promise<BridgeResponse>;
  sendPromptAsFileAndWait: (args: {
    provider: AiProvider;
    coverPrompt: string;
    fileText: string;
    filename: string;
    forceNewChat?: boolean;
  }) => Promise<BridgeResponse>;
}

export interface JobBuildResult {
  resume: ResumeData;
  council: CouncilSnapshot | null;
  linkedSession: AiChatSession | null;
}

type CandidateOutcome =
  | { ok: true; result: CouncilCandidateResult }
  | { ok: false; failure: CouncilCandidateFailure };

/** Attachment names for tasks delivered as files on truncating providers. */
const RESUME_TASK_FILENAME = 'resume-task.txt';
const JUDGE_TASK_FILENAME = 'judge-task.txt';

/** The slots a job starts with, before any send fires. */
export function buildInitialSlots(config: CouncilRunConfig): CouncilSlotState[] {
  if (config.genMode === 'solitary') {
    return [
      {
        slotId: 'candidate-1',
        role: 'candidate',
        provider: config.provider,
        title: 'Model',
        status: 'waiting',
      },
    ];
  }
  const slots: CouncilSlotState[] = config.candidateProviders.map((provider, i) => ({
    slotId: `candidate-${i + 1}`,
    role: 'candidate',
    provider,
    title: `Candidate ${i + 1}`,
    status: 'waiting',
  }));
  slots.push({
    slotId: 'judge',
    role: 'judge',
    provider: config.judgeProvider,
    title: 'Judge',
    status: 'waiting',
  });
  return slots;
}

interface RunJobArgs {
  config: CouncilRunConfig;
  /** Full repository prompt for this job's JD, built by the caller. */
  candidatePrompt: string;
  jobDescription: string;
  /** Style instruction block, reused in the judge prompt. */
  styleInstructions: string;
  sources: RepositorySource[];
  senders: CouncilSenders;
  onSlot: (slotId: string, patch: Partial<CouncilSlotState>) => void;
  isCancelled: () => boolean;
}

async function runCandidate(
  slotId: string,
  provider: AiProvider,
  candidatePrompt: string,
  senders: CouncilSenders,
  onSlot: RunJobArgs['onSlot'],
  isCancelled: () => boolean,
): Promise<CandidateOutcome> {
  onSlot(slotId, { status: 'configuring' });
  let settled = false;
  // App-side heuristic: after a fresh chat usually opens, show "generating".
  const timer = window.setTimeout(() => {
    if (!settled && !isCancelled()) onSlot(slotId, { status: 'generating' });
  }, 5500);
  try {
    // The repository build prompt is large enough that Gemini's composer
    // truncates it, cutting off the JSON contract at the tail. Deliver it as an
    // attachment there; every other provider still pastes.
    const res = await sendLargePromptAndWait({
      provider,
      prompt: candidatePrompt,
      coverPrompt: buildResumeBuildCoverPrompt(RESUME_TASK_FILENAME),
      filename: RESUME_TASK_FILENAME,
      senders,
    });
    settled = true;
    if (isCancelled()) {
      return { ok: false, failure: { slotId, provider, error: 'Cancelled.' } };
    }
    if (!res.rawResponse) {
      throw new Error(res.error ?? 'No response captured.');
    }
    onSlot(slotId, { status: 'parsing' });
    const resume = parseStrictGeneratedResume(res.rawResponse);
    const session = res.session ?? null;
    if (session) saveAiSession(session);
    onSlot(slotId, { status: 'done' });
    return {
      ok: true,
      result: {
        slotId,
        provider,
        label: 'A',
        resume,
        baseline: null,
        rawResponse: res.rawResponse,
        session,
      },
    };
  } catch (err) {
    settled = true;
    const message = err instanceof Error ? err.message : 'Candidate failed.';
    onSlot(slotId, { status: 'failed', error: message });
    return { ok: false, failure: { slotId, provider, error: message } };
  } finally {
    window.clearTimeout(timer);
  }
}

function snapshotFrom(
  config: CouncilRunConfig,
  labeled: CouncilCandidateResult[],
  failures: CouncilCandidateFailure[],
  judge: CouncilJudgeResult | null,
): CouncilSnapshot {
  return {
    mode: 'council',
    providers: {
      candidates: config.candidateProviders,
      judge: config.judgeProvider,
    },
    candidateOutputs: labeled.map((candidate) => ({
      provider: candidate.provider,
      label: candidate.label,
      resume: candidate.resume,
    })),
    judgeOutput: judge
      ? { synthesisNotes: judge.synthesisNotes, scores: judge.scores }
      : null,
    failures,
  };
}

export async function runJob(args: RunJobArgs): Promise<JobBuildResult> {
  const { config, candidatePrompt, jobDescription, styleInstructions, sources, senders, onSlot, isCancelled } =
    args;

  // ── Single model ──────────────────────────────────────────────────────────
  if (config.genMode === 'solitary') {
    const outcome = await runCandidate(
      'candidate-1',
      config.provider,
      candidatePrompt,
      senders,
      onSlot,
      isCancelled,
    );
    if (!outcome.ok) throw new Error(outcome.failure.error);
    return {
      resume: outcome.result.resume,
      council: null,
      linkedSession: outcome.result.session,
    };
  }

  // ── Council: candidates in parallel ─────────────────────────────────────────
  const outcomes = await Promise.all(
    config.candidateProviders.map((provider, index) =>
      runCandidate(
        `candidate-${index + 1}`,
        provider,
        candidatePrompt,
        senders,
        onSlot,
        isCancelled,
      ),
    ),
  );
  if (isCancelled()) throw new Error('Cancelled.');

  const successes: CouncilCandidateResult[] = [];
  const failures: CouncilCandidateFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) successes.push(outcome.result);
    else if (outcome.failure.error !== 'Cancelled.') failures.push(outcome.failure);
  }

  const labeled = successes.map((result, index) => ({
    ...result,
    label: CANDIDATE_LABELS[index],
  }));
  labeled.forEach((item) => onSlot(item.slotId, { label: item.label }));

  if (labeled.length === 0) {
    throw new Error(
      `All candidates failed. ${failures.map((f) => `${f.provider}: ${f.error}`).join(' · ')}`,
    );
  }

  // Fewer than 2 successes → no judge; apply the single candidate.
  if (labeled.length < 2) {
    onSlot('judge', { status: 'failed', error: 'Skipped — needs 2+ candidates.' });
    return {
      resume: labeled[0].resume,
      council: snapshotFrom(config, labeled, failures, null),
      linkedSession: labeled[0].session,
    };
  }

  // ── Judge (sequential) ──────────────────────────────────────────────────────
  onSlot('judge', { status: 'configuring' });
  let judgeSettled = false;
  const judgeTimer = window.setTimeout(() => {
    if (!judgeSettled && !isCancelled()) onSlot('judge', { status: 'generating' });
  }, 5500);

  // No initializer: the catch below always returns, so reaching past the
  // try/catch means the assignment inside the try ran.
  let judge: CouncilJudgeResult;
  try {
    const judgePrompt = buildCouncilJudgePrompt({
      path: 'repository',
      jobDescription,
      candidates: labeled.map((item) => ({ label: item.label, resume: item.resume })),
      styleInstructions,
      sources,
    });

    const response: BridgeResponse = await sendLargePromptAndWait({
      provider: config.judgeProvider,
      prompt: judgePrompt,
      coverPrompt: buildCouncilJudgeCoverPrompt(JUDGE_TASK_FILENAME),
      filename: JUDGE_TASK_FILENAME,
      senders,
    });
    judgeSettled = true;
    if (isCancelled()) throw new Error('Cancelled.');
    if (!response.rawResponse) throw new Error(response.error ?? 'No judge response captured.');
    onSlot('judge', { status: 'parsing' });
    const parsed = parseCouncilJudgeResponse(response.rawResponse, null);
    if (response.session) saveAiSession(response.session);
    judge = {
      scores: parsed.scores,
      synthesisNotes: parsed.synthesisNotes,
      final: parsed.final,
      finalBaseline: null,
      rawResponse: response.rawResponse,
      session: response.session ?? null,
    };
    onSlot('judge', { status: 'done' });
  } catch (err) {
    judgeSettled = true;
    const message = err instanceof Error ? err.message : 'Judge failed.';
    onSlot('judge', { status: 'failed', error: message });
    // Judge failure still yields a usable resume (best candidate).
    return {
      resume: labeled[0].resume,
      council: snapshotFrom(config, labeled, failures, null),
      linkedSession: labeled[0].session,
    };
  } finally {
    window.clearTimeout(judgeTimer);
  }

  return {
    resume: judge.final,
    council: snapshotFrom(config, labeled, failures, judge),
    linkedSession: judge.session ?? labeled[0].session,
  };
}
