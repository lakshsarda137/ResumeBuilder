import { useMemo, useState } from 'react';
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
import { ResumeDiffView } from './ResumeDiffView';
import { FormatToolbar } from './FormatToolbar';
import { ResumeRenderSettingsControls } from './ResumeRenderSettingsControls';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import './AiResultModal.css';

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
  onRenderSettingsChange,
  onApply,
  onDiscard,
  onRefine,
}: AiResultModalProps) {
  const [improvementPrompt, setImprovementPrompt] = useState(
    'Tighten the third bullet and make the tone more confident.',
  );
  const [showJdNotes, setShowJdNotes] = useState(true);

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

  const title = titles[variant] ?? titles.edit;
  const description = descriptions[variant] ?? descriptions.edit;
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
              Apply to editor
            </button>
          </div>
        </header>

        <div className="ai-result-body">
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
            </div>
            {renderSettings && onRenderSettingsChange ? (
              <details className="ai-result-format-settings" open>
                <summary>Formatting settings</summary>
                <ResumeRenderSettingsControls
                  settings={renderSettings}
                  onChange={onRenderSettingsChange}
                  tone="light"
                  compact
                />
              </details>
            ) : null}
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
