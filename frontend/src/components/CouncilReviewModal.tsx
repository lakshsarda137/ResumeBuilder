import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { CouncilSnapshot } from '../types/council';
import type { ResumeData } from '../types/resume';
import type { ResumeRenderSettings } from '../utils/resumeSettings';
import { keyRubric } from '../utils/councilSettings';
import { getProviderConfig } from '../utils/aiProviders';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import './AiResultModal.css';

const APPLIED_VIEW = 'applied';

interface CouncilReviewModalProps {
  open: boolean;
  snapshot: CouncilSnapshot;
  /** The resume currently in the editor — i.e. the version that was applied. */
  appliedResume: ResumeData;
  renderSettings?: ResumeRenderSettings;
  onClose: () => void;
}

export function CouncilReviewModal({
  open,
  snapshot,
  appliedResume,
  renderSettings,
  onClose,
}: CouncilReviewModalProps) {
  const [view, setView] = useState(APPLIED_VIEW);

  // Re-derive the rubric keys the judge used so persisted scores (keyed by the
  // runtime key) map back onto the stored dimension titles.
  const keyedRubric = useMemo(
    () => keyRubric(snapshot.rubricUsed),
    [snapshot.rubricUsed],
  );

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

  if (!open) {
    return null;
  }

  const selectedCandidate =
    view === APPLIED_VIEW
      ? null
      : snapshot.candidateOutputs.find((c) => c.label === view) ?? null;

  const previewData = selectedCandidate?.resume ?? appliedResume;

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
              The applied result is already in your editor.
            </p>
          </div>
          <div className="ai-result-actions">
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
                  {keyedRubric.map((dim) => (
                    <div key={dim.key} className="ai-council-score-row">
                      <div className="ai-council-score-head">
                        <span className="ai-council-score-title">{dim.title}</span>
                        <span className="ai-council-score-value">
                          {candidateScores?.scores[dim.key] != null
                            ? `${candidateScores.scores[dim.key]}/10`
                            : '—'}
                        </span>
                      </div>
                      {candidateScores?.rationales[dim.key] ? (
                        <p className="ai-council-score-rationale">
                          {candidateScores.rationales[dim.key]}
                        </p>
                      ) : null}
                    </div>
                  ))}
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
            </div>
            <div className="ai-result-preview-canvas">
              <div className="ai-result-preview-stack">
                <ResumeWithJdNotes
                  data={previewData}
                  onChange={() => {}}
                  editing={false}
                  id="resume-council-review-preview"
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
