import { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { CouncilSnapshot } from '../types/council';
import type { ResumeData } from '../types/resume';
import type { ResumeRenderSettings } from '../utils/resumeSettings';
import { getProviderConfig } from '../utils/aiProviders';
import { inspectResumePageFit, type ResumePageFit } from '../utils/pdf';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import './AiResultModal.css';

const APPLIED_VIEW = 'applied';
const REVIEW_PREVIEW_ID = 'resume-council-review-preview';

interface CouncilReviewModalProps {
  open: boolean;
  snapshot: CouncilSnapshot;
  /** The resume currently in the editor — i.e. the version that was applied. */
  appliedResume: ResumeData;
  renderSettings?: ResumeRenderSettings;
  onApply: (resume: ResumeData) => void;
  onClose: () => void;
}

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

export function CouncilReviewModal({
  open,
  snapshot,
  appliedResume,
  renderSettings,
  onApply,
  onClose,
}: CouncilReviewModalProps) {
  const [view, setView] = useState(APPLIED_VIEW);
  const [pageFit, setPageFit] = useState<ResumePageFit | null>(null);

  const tabs = useMemo(
    () => [
      { id: APPLIED_VIEW, label: 'Applied result' },
      ...snapshot.candidateOutputs.map((candidate) => ({
        id: candidate.label,
        label: `Candidate ${candidate.label} · ${getProviderConfig(candidate.provider).label}`,
      })),
    ],
    [snapshot.candidateOutputs],
  );

  const selectedCandidate =
    view === APPLIED_VIEW
      ? null
      : snapshot.candidateOutputs.find((c) => c.label === view) ?? null;

  const previewData = selectedCandidate?.resume ?? appliedResume;

  // Measure the previewed resume so its page-fit is visible for every tab,
  // even after one was already applied to the editor.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    inspectResumePageFit(REVIEW_PREVIEW_ID)
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

  if (!open) {
    return null;
  }

  const candidateScores = selectedCandidate
    ? snapshot.judgeOutput?.scores[selectedCandidate.label] ?? null
    : null;

  return (
    <div className="ai-result-overlay" role="dialog" aria-modal="true">
      <div className="ai-result-modal">
        <header className="ai-result-header">
          <div>
            <h2>LLM Council — candidate review</h2>
            <p>
              Browse the resume each candidate produced and the judge’s scores.
              Apply a different version to your editor any time.
            </p>
          </div>
          <div className="ai-result-actions">
            {selectedCandidate ? (
              <button
                type="button"
                className="ai-result-btn ai-result-btn--primary"
                onClick={() => {
                  onApply(selectedCandidate.resume);
                  onClose();
                }}
              >
                <Check size={14} /> Apply Candidate {selectedCandidate.label} to editor
              </button>
            ) : (
              <span className="ai-council-applied-tag">
                <Check size={13} /> In your editor
              </span>
            )}
            <button
              type="button"
              className="ai-result-btn ai-result-btn--secondary"
              onClick={onClose}
            >
              <X size={14} /> Close
            </button>
          </div>
        </header>

        <div className="ai-result-body">
          <div className="ai-council-bar">
            <div
              className="ai-council-tabs"
              role="tablist"
              aria-label="Council results"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={view === tab.id}
                  className={`ai-council-tab${view === tab.id ? ' ai-council-tab--active' : ''}`}
                  onClick={() => setView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {snapshot.failures.length > 0 ? (
              <div className="ai-council-failures">
                {snapshot.failures.map((failure, index) => (
                  <span
                    key={`${failure.provider}-${index}`}
                    className="ai-council-failure-badge"
                    title={failure.error}
                  >
                    {getProviderConfig(failure.provider).label} failed
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {selectedCandidate ? (
            <section className="ai-council-scores">
              <h3>
                Candidate {selectedCandidate.label} ·{' '}
                {getProviderConfig(selectedCandidate.provider).label}
              </h3>
              {snapshot.judgeOutput ? (
                <div className="ai-council-score-grid">
                  <div className="ai-council-score-row">
                    <div className="ai-council-score-head">
                      <span className="ai-council-score-title">ATS score</span>
                      <span className="ai-council-score-value">
                        {candidateScores?.atsScore != null
                          ? `${candidateScores.atsScore}/100`
                          : '—'}
                      </span>
                    </div>
                    {candidateScores?.justification ? (
                      <p className="ai-council-score-rationale">
                        {candidateScores.justification}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="ai-council-score-empty">
                  The judge did not run for this build, so candidate scores are
                  unavailable — this is the candidate’s raw generated resume.
                </p>
              )}
            </section>
          ) : null}

          {view === APPLIED_VIEW && snapshot.judgeOutput?.synthesisNotes ? (
            <section className="ai-council-synthesis">
              <h3>Judge synthesis notes</h3>
              <p>{snapshot.judgeOutput.synthesisNotes}</p>
            </section>
          ) : null}

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
            <div className="ai-result-preview-canvas">
              <div className="ai-result-preview-stack">
                <ResumeWithJdNotes
                  data={previewData}
                  onChange={() => {}}
                  editing={false}
                  id={REVIEW_PREVIEW_ID}
                  showJdNotes={false}
                  settings={renderSettings}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
