import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  computeMilestoneStates,
  pipelineActiveMilestoneLabel,
  pipelineHasError,
  pipelineStatusDetail,
  type PipelineEvent,
  type PipelineVariant,
} from '../utils/aiPipeline';
import './PipelineStatus.css';

interface PipelineStatusProps {
  events: PipelineEvent[];
  variant: PipelineVariant | null;
}

function stripElapsedSuffix(label: string) {
  return label.replace(/\s*\(\d+s\)\s*$/, '').trim();
}

export function PipelineStatus({ events, variant }: PipelineStatusProps) {
  const latest = events[events.length - 1];
  const isWaiting = latest?.step === 'waiting';
  const waitingStartedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isWaiting) {
      waitingStartedAtRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (waitingStartedAtRef.current === null) {
      waitingStartedAtRef.current = latest.at;
    }

    const tick = () => {
      if (waitingStartedAtRef.current !== null) {
        setElapsedSeconds(
          Math.round((Date.now() - waitingStartedAtRef.current) / 1000),
        );
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [isWaiting, latest?.at, latest?.label]);

  const milestones = useMemo(() => {
    if (!variant) {
      return [];
    }
    return computeMilestoneStates(variant, events);
  }, [events, variant]);

  if (!variant || milestones.length === 0) {
    return null;
  }

  const hasError = pipelineHasError(events);
  const detail = pipelineStatusDetail(events);
  const activeMilestone = pipelineActiveMilestoneLabel(variant, events);
  const displayDetail = isWaiting
    ? activeMilestone
      ? `${activeMilestone} — ${stripElapsedSuffix(latest.label)} (${elapsedSeconds}s)`
      : `${stripElapsedSuffix(latest.label)} (${elapsedSeconds}s)`
    : activeMilestone && !hasError && latest?.step !== 'preview_ready'
      ? `${activeMilestone} — ${detail}`
      : detail;

  return (
    <div className="pipeline-status" role="status" aria-live="polite">
      <div className="pipeline-steps" aria-label="Generation progress">
        {milestones.map((milestone, index) => (
          <div
            key={`${milestone.id}-${index}`}
            className="pipeline-step"
          >
            {index > 0 ? (
              <div
                className={`pipeline-step-connector${
                  milestones[index - 1].status === 'complete'
                    ? ' pipeline-step-connector--complete'
                    : ''
                }${hasError && milestones[index - 1].status === 'error' ? ' pipeline-step-connector--error' : ''}`}
                aria-hidden
              />
            ) : null}
            <div
              className={`pipeline-step-circle pipeline-step-circle--${milestone.status}`}
              aria-current={milestone.status === 'active' ? 'step' : undefined}
            >
              {milestone.status === 'complete' ? (
                <Check size={11} strokeWidth={3} />
              ) : null}
            </div>
            <span
              className={`pipeline-step-label pipeline-step-label--${milestone.status}`}
            >
              {milestone.label}
            </span>
          </div>
        ))}
      </div>
      {displayDetail ? (
        <p className={`pipeline-status-detail${hasError ? ' pipeline-status-detail--error' : ''}`}>
          {displayDetail}
        </p>
      ) : null}
    </div>
  );
}
