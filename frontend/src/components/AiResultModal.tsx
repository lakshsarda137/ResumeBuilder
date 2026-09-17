import { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { ResumeData } from '../types/resume';
import { buildImprovementPrompt } from '../utils/aiPrompt';
import { resumeHasJdNotes } from '../utils/jdNotes';
import { computeResumeDiff } from '../utils/resumeDiff';
import {
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import {
  estimateInputTokens,
  formatTokenEstimate,
} from '../utils/tokenEstimate';
import { inspectResumePageFit, type ResumePageFit } from '../utils/pdf';
import { ResumeDiffView } from './ResumeDiffView';
import { FormatToolbar } from './FormatToolbar';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import './AiResultModal.css';

const AI_PREVIEW_ID = 'resume-ai-preview';

function pageFitVariant(fit: ResumePageFit): string {
  if (fit.status === 'fit' && !fit.safe) {
    return 'tight';
  }
  return fit.status;
}

function pageFitLabel(fit: ResumePageFit): string {
  const percent = Math.round(fit.usageRatio * 100);
  if (fit.status === 'over') {
    return `Over 1 page (${percent}%)`;
  }
  if (fit.status === 'under') {
    return `Under 1 page (${percent}%)`;
  }
  if (!fit.safe) {
    return `Tight fit (${percent}%)`;
  }
  return `Fits 1 page (${percent}%)`;
}

export interface CouncilModalScoreRow {
  title: string;
  score: number | null;
  rationale: string;
}

export interface CouncilModalTab {
  id: string;
  label: string;
}

export interface CouncilModalData {
  tabs: CouncilModalTab[];
  view: string;
  onViewChange: (view: string) => void;
  hasJudgeFinal: boolean;
  judgeError: string | null;
  synthesisNotes: string;
  noJobDescription: boolean;
  failures: Array<{ provider: string; error: string }>;
  /**
   * Every candidate's ATS score, shown on the default tab.
   *
   * `selected` only exists while a candidate tab is open, so the scores used to
   * be reachable one number at a time and were invisible on the view the modal
   * actually opens on — which read as "the build produced no scores".
   */
  allScores: Array<{
    candidateLabel: string;
    providerLabel: string;
    score: number | null;
    justification: string;
  }>;
  selected: {
    providerLabel: string;
    candidateLabel: string;
    scores: CouncilModalScoreRow[];
  } | null;
}

interface AiResultModalProps {
  open: boolean;
  variant?: 'edit' | 'import' | 'optimize' | 'repository';
  importFilename?: string;
  baselineData?: ResumeData | null;
  changes?: string[];
  refinementChanges: string[] | null;
  previewData: ResumeData;
  rawResponse: string;
  session: AiChatSession | null;
  refining: boolean;
  renderSettings?: ResumeRenderSettings;
  onRenderSettingsChange?: (settings: ResumeRenderSettings) => void;
  onApply: () => void;
  onDiscard: () => void;
  onRefine: (instruction: string) => void;
  council?: CouncilModalData | null;
}

export function AiResultModal({
  open,
  variant = 'edit',
  importFilename,
  baselineData,
  changes = [],
  refinementChanges,
  previewData,
  rawResponse,
  session,
  refining,
  renderSettings,
  onApply,
  onDiscard,
  onRefine,
  council = null,
}: AiResultModalProps) {
  const [improvementPrompt, setImprovementPrompt] = useState(
    'Tighten the third bullet and make the tone more confident.',
  );
  const [showJdNotes, setShowJdNotes] = useState(true);
  const [pageFit, setPageFit] = useState<ResumePageFit | null>(null);

  // Measure the currently-previewed resume's page fit so it's visible before
  // applying. Re-runs when the previewed resume (e.g. a council view) changes.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    inspectResumePageFit(AI_PREVIEW_ID)
      .then((fit) => {
        if (!cancelled) {
          setPageFit(fit);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPageFit(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, previewData, renderSettings]);

  const hasJdNotes = useMemo(
    () => resumeHasJdNotes(previewData),
    [previewData],
  );

  const diffChanges = useMemo(() => {
    if (!baselineData) {
      return [];
    }
    return computeResumeDiff(baselineData, previewData);
  }, [baselineData, previewData]);

  const improvementTokenEstimate = useMemo(
    () => estimateInputTokens(buildImprovementPrompt(improvementPrompt, previewData)),
    [improvementPrompt, previewData],
  );

  if (!open) {
    return null;
  }

  const titles: Record<string, string> = {
    edit: 'AI edits ready',
    import: 'Imported resume ready',
    optimize: 'Optimized resume ready',
    repository: 'Resume built from repository',
  };

  const descriptions: Record<string, string> = {
    edit: 'Review the updated resume, then apply it to your editor.',
    import: `Review the extracted content from ${importFilename || 'your PDF'}, then apply it to your editor.`,
    optimize: 'Review how your resume changed for this job, then apply it to your editor.',
    repository:
      'Review the tailored resume built from your repository sources, then apply it to your editor.',
  };

  const title = council ? 'LLM Council result' : titles[variant] ?? titles.edit;
  const description = council
    ? 'Compare the judge’s merged resume against each candidate, then apply the version you want.'
    : descriptions[variant] ?? descriptions.edit;
  const viewingCandidate = Boolean(council && council.view !== 'final');
  const applyLabel = viewingCandidate ? 'Apply this candidate' : 'Apply to editor';
  const refinementBaselineNote =
    variant === 'import'
      ? 'All changes since import:'
      : 'All changes since last send:';

  return (
    <div className="ai-result-overlay" role="dialog" aria-modal="true">
      <div className="ai-result-modal">
        <header className="ai-result-header">
          <div>
            <h2>{title}</h2>
            <p>
              {description}
              {session ? (
                <>
                  {' '}
                  Linked chat: <strong>{session.chatTitle}</strong>
                </>
              ) : null}
            </p>
          </div>
          <div className="ai-result-actions">
            <button
              type="button"
              className="ai-result-btn ai-result-btn--secondary"
              onClick={onDiscard}
              disabled={refining}
            >
              Discard
            </button>
            <button
              type="button"
              className="ai-result-btn ai-result-btn--primary"
              onClick={onApply}
              disabled={refining}
            >
              {applyLabel}
            </button>
          </div>
        </header>

        <div className="ai-result-body">
          {council ? (
            <div className="ai-council-bar">
              <div
                className="ai-council-tabs"
                role="tablist"
                aria-label="Council results"
              >
                {council.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={council.view === tab.id}
                    className={`ai-council-tab${council.view === tab.id ? ' ai-council-tab--active' : ''}`}
                    onClick={() => council.onViewChange(tab.id)}
                    disabled={refining}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {council.failures.length > 0 ? (
                <div className="ai-council-failures">
                  {council.failures.map((failure, index) => (
                    <span
                      key={`${failure.provider}-${index}`}
                      className="ai-council-failure-badge"
                      title={failure.error}
                    >
                      {failure.provider} failed
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {council?.judgeError ? (
            <div className="ai-council-judge-error" role="alert">
              <strong>Judge unavailable.</strong> {council.judgeError}
            </div>
          ) : null}

          {/* Overview: every candidate's score, on the tab the modal opens on. */}
          {council && !council.selected && council.allScores.length > 0 ? (
            <section className="ai-council-scores">
              <h3>Judge&rsquo;s recruiter scores</h3>
              {council.noJobDescription ? (
                <p className="ai-council-score-empty">
                  No job description was provided for this run, so
                  job-description alignment was not scored.
                </p>
              ) : null}
              <div className="ai-council-score-grid">
                {council.allScores.map((row) => (
                  <div key={row.candidateLabel} className="ai-council-score-row">
                    <div className="ai-council-score-head">
                      <span className="ai-council-score-title">
                        Candidate {row.candidateLabel} · {row.providerLabel}
                      </span>
                      <span className="ai-council-score-value">
                        {row.score != null ? `${row.score}/100` : '—'}
                      </span>
                    </div>
                    {row.justification ? (
                      <p className="ai-council-score-rationale">{row.justification}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {council?.selected ? (
            <section className="ai-council-scores">
              <h3>
                Candidate {council.selected.candidateLabel} ·{' '}
                {council.selected.providerLabel}
              </h3>
              {council.hasJudgeFinal && council.noJobDescription ? (
                <p className="ai-council-score-empty">
                  No job description was provided for this run, so job-description
                  alignment was not scored. Dimensions that need a JD show “—”.
                </p>
              ) : null}
              {council.hasJudgeFinal ? (
                <div className="ai-council-score-grid">
                  {council.selected.scores.map((row, index) => (
                    <div key={`${row.title}-${index}`} className="ai-council-score-row">
                      <div className="ai-council-score-head">
                        <span className="ai-council-score-title">{row.title}</span>
                        <span className="ai-council-score-value">
                          {/* /100, not /10 — the judge is instructed to give a
                              single ATS score out of 100 (see types/council.ts
                              and buildCouncilJudgePrompt), and CouncilReviewModal
                              already renders it that way. */}
                          {row.score != null ? `${row.score}/100` : '—'}
                        </span>
                      </div>
                      {row.rationale ? (
                        <p className="ai-council-score-rationale">{row.rationale}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-council-score-empty">
                  Judge scores are unavailable for this run — this is the
                  candidate’s raw generated resume.
                </p>
              )}
            </section>
          ) : null}

          {council?.hasJudgeFinal &&
          council.view === 'final' &&
          council.synthesisNotes ? (
            <section className="ai-council-synthesis">
              <h3>Judge synthesis notes</h3>
              <p>{council.synthesisNotes}</p>
            </section>
          ) : null}

          <section className="ai-result-changes">
            <h3>What changed</h3>
            <p className="ai-result-changes-intro">
              Green = new resume text · Red strikethrough = removed · Blue dashed box =
              AI commentary only (not on the PDF).
            </p>
            {baselineData ? (
              <ResumeDiffView changes={diffChanges} />
            ) : (
              <ul>
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}
            {refinementChanges && refinementChanges.length > 0 ? (
              <>
                <p className="ai-result-changes-note">
                  Latest improvement prompt changed:
                </p>
                <ul className="ai-result-changes-refinement">
                  {refinementChanges.map((change) => (
                    <li key={`refine-${change}`}>{change}</li>
                  ))}
                </ul>
                <p className="ai-result-changes-note">{refinementBaselineNote}</p>
              </>
            ) : null}
          </section>

          <section className="ai-result-preview">
            <div className="ai-result-preview-heading">
              <h3>Preview</h3>
              {pageFit ? (
                <span
                  className={`ai-result-pagefit ai-result-pagefit--${pageFitVariant(pageFit)}`}
                  title="Estimated from the PDF export layout — adjust formatting in the editor after applying"
                >
                  {pageFitLabel(pageFit)}
                </span>
              ) : null}
            </div>
            <p className="ai-result-preview-note">
              Formatting controls live in the editor after you apply.
            </p>
            <div className="ai-result-preview-canvas">
              <div
                className={`ai-result-preview-stack${showJdNotes && hasJdNotes ? ' ai-result-preview-stack--with-jd' : ''}`}
              >
                {hasJdNotes ? (
                  <FormatToolbar
                    variant="canvas"
                    showControls={false}
                    hint="Hover or click a note to highlight the match"
                    trailing={
                      <button
                        type="button"
                        className={`format-toolbar-jd-btn${showJdNotes ? ' format-toolbar-jd-btn--on' : ''}`}
                        onClick={() => setShowJdNotes((v) => !v)}
                      >
                        {showJdNotes ? 'Hide JD notes' : 'Show JD notes'}
                      </button>
                    }
                  />
                ) : null}
                <ResumeWithJdNotes
                  data={previewData}
                  onChange={() => {}}
                  editing={false}
                  id="resume-ai-preview"
                  showJdNotes={showJdNotes}
                  settings={renderSettings}
                />
              </div>
            </div>
          </section>

          <section className="ai-result-refine">
            <h3>Refine in same chat</h3>
            <p className="ai-result-refine-copy">
              Send another instruction to the same LLM chat session without
              starting over. {formatTokenEstimate(improvementTokenEstimate)}
            </p>
            <textarea
              className="ai-result-refine-input"
              value={improvementPrompt}
              onChange={(e) => setImprovementPrompt(e.target.value)}
              rows={3}
              disabled={refining || !session}
            />
            <button
              type="button"
              className="ai-result-btn ai-result-btn--refine"
              onClick={() => onRefine(improvementPrompt)}
              disabled={refining || !session || !improvementPrompt.trim()}
            >
              {refining ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <MessageSquarePlus size={14} />
              )}
              {refining ? 'Waiting for refinement…' : 'Send improvement'}
            </button>
          </section>

          <details className="ai-result-raw">
            <summary>Raw LLM response</summary>
            <pre>{rawResponse}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
