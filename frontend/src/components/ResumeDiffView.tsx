import { useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import type { ResumeDiffChange } from '../utils/resumeDiff';
import { countDiffChanges } from '../utils/resumeDiff';
import './ResumeDiffView.css';

interface ResumeDiffViewProps {
  changes: ResumeDiffChange[];
  /** Document noun used in change-card copy, e.g. "resume" or "cover letter". */
  documentLabel?: string;
}

const KIND_LABELS: Record<ResumeDiffChange['kind'], string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
};

export function ResumeDiffView({ changes, documentLabel = 'resume' }: ResumeDiffViewProps) {
  const counts = useMemo(() => countDiffChanges(changes), [changes]);

  if (changes.length === 0) {
    return <p className="resume-diff-empty">No content changes detected.</p>;
  }

  return (
    <div className="resume-diff">
      <div className="resume-diff-summary">
        <span className="resume-diff-stat resume-diff-stat--mod">
          {counts.modified} changed
        </span>
        <span className="resume-diff-stat resume-diff-stat--add">
          +{counts.added} added
        </span>
        <span className="resume-diff-stat resume-diff-stat--remove">
          −{counts.removed} removed
        </span>
      </div>

      <div className="resume-diff-list">
        {changes.map((change) => (
          <article
            key={change.id}
            className={`resume-diff-card resume-diff-card--${change.kind}`}
          >
            <header className="resume-diff-card-header">
              <span className={`resume-diff-badge resume-diff-badge--${change.kind}`}>
                {KIND_LABELS[change.kind]}
              </span>
              <span className="resume-diff-location">{change.location}</span>
              <span className="resume-diff-label">{change.label}</span>
            </header>

            <div className="resume-diff-card-body">
              {change.kind === 'modified' && (
                <>
                  {change.before && (
                    <div className="resume-diff-block resume-diff-block--removed">
                      <span className="resume-diff-block-tag">Was on {documentLabel}</span>
                      <p>{change.before}</p>
                    </div>
                  )}
                  {change.after && (
                    <div className="resume-diff-block resume-diff-block--added">
                      <span className="resume-diff-block-tag">Now on {documentLabel}</span>
                      <p>{change.after}</p>
                    </div>
                  )}
                </>
              )}

              {change.kind === 'added' && change.after && (
                <div className="resume-diff-block resume-diff-block--added">
                  <span className="resume-diff-block-tag">New on {documentLabel}</span>
                  <p>{change.after}</p>
                </div>
              )}

              {change.kind === 'removed' && change.before && (
                <div className="resume-diff-block resume-diff-block--removed">
                  <span className="resume-diff-block-tag">Removed from {documentLabel}</span>
                  <p>{change.before}</p>
                </div>
              )}

              {change.aiNote && (
                <div className="resume-diff-ai-note">
                  <div className="resume-diff-ai-note-header">
                    <MessageCircle size={13} />
                    <span>AI note — not printed on your {documentLabel}</span>
                  </div>
                  <p>{change.aiNote}</p>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
