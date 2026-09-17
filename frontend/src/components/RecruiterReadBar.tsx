import { Eye, Loader2, RotateCcw } from 'lucide-react';
import { getProviderConfig, type AiProvider } from '../utils/aiProviders';
import type { RecruiterReadResult, RecruiterReadStatus } from '../utils/recruiterRead';
import './RecruiterReadBar.css';

interface RecruiterReadBarProps {
  status: RecruiterReadStatus;
  result: RecruiterReadResult | null;
  error: string | null;
  /** Provider currently reading, while status is "reading". */
  readingProvider: AiProvider | null;
  /** True once the resume has been edited after this read was taken. */
  stale: boolean;
  canRun: boolean;
  onRun: () => void;
}

/**
 * The cold recruiter summary of the resume, docked above the page. Information
 * only: the user reads it and decides whether the resume says what they built.
 */
export function RecruiterReadBar({
  status,
  result,
  error,
  readingProvider,
  stale,
  canRun,
  onRun,
}: RecruiterReadBarProps) {
  if (status === 'idle' && !result) {
    return null;
  }

  const reading = status === 'reading';
  const providerLabel = (provider: AiProvider | null) =>
    provider ? getProviderConfig(provider).label : 'The model';

  return (
    <section
      className={`recruiter-read${status === 'failed' ? ' recruiter-read--failed' : ''}`}
      aria-label="Recruiter's 10-second read"
      aria-live="polite"
    >
      <Eye size={15} className="recruiter-read__icon" aria-hidden />
      <div className="recruiter-read__body">
        <span className="recruiter-read__label">
          Recruiter&rsquo;s 10-second read
          {result && !reading ? (
            <span className="recruiter-read__meta">
              {' · '}
              {providerLabel(result.provider)}
              {stale ? ' · resume edited since' : ''}
            </span>
          ) : null}
        </span>
        {reading ? (
          <p className="recruiter-read__text recruiter-read__text--muted">
            {providerLabel(readingProvider)} is skimming the resume with only the job
            description, no repository…
          </p>
        ) : status === 'failed' ? (
          <p className="recruiter-read__text">Recruiter read failed: {error}</p>
        ) : result ? (
          <p className="recruiter-read__text">{result.summary}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="toolbar-btn toolbar-btn--secondary recruiter-read__action"
        onClick={onRun}
        disabled={reading || !canRun}
        title={
          canRun
            ? 'Run the recruiter read again on the resume as it is now'
            : 'Connect to an AI provider first'
        }
      >
        {reading ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
        {status === 'failed' ? 'Retry' : 'Re-read'}
      </button>
    </section>
  );
}
