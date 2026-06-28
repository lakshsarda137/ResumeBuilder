import { Check, GitBranch, GitMerge, X } from 'lucide-react';
import {
  councilMilestoneStates,
  councilStatusLabel,
} from '../utils/aiPipeline';
import { getProviderConfig } from '../utils/aiProviders';
import type { CouncilSlotState, CouncilSlotStatus } from '../types/council';
import './PipelineStatus.css';
import './CouncilProgress.css';

interface CouncilProgressProps {
  slots: CouncilSlotState[];
  onCancel?: () => void;
  canceling?: boolean;
}

const ACTIVE_STATUSES: CouncilSlotStatus[] = [
  'configuring',
  'generating',
  'parsing',
];

function dotModifier(status: CouncilSlotStatus): string {
  if (status === 'done') return 'complete';
  if (status === 'failed') return 'error';
  if (ACTIVE_STATUSES.includes(status)) return 'active';
  return 'pending';
}

function MiniSteps({ slot }: { slot: CouncilSlotState }) {
  const milestones = councilMilestoneStates(slot.role, slot.status);
  return (
    <div className="pipeline-steps council-mini-steps">
      {milestones.map((milestone, index) => (
        <div key={`${milestone.id}-${index}`} className="pipeline-step">
          {index > 0 ? (
            <div
              className={`pipeline-step-connector${
                milestones[index - 1].status === 'complete'
                  ? ' pipeline-step-connector--complete'
                  : ''
              }${
                milestones[index - 1].status === 'error'
                  ? ' pipeline-step-connector--error'
                  : ''
              }`}
              aria-hidden
            />
          ) : null}
          <div
            className={`pipeline-step-circle pipeline-step-circle--${milestone.status}`}
          >
            {milestone.status === 'complete' ? (
              <Check size={8} strokeWidth={3} />
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
  );
}

function Rail({ first, last }: { first?: boolean; last?: boolean }) {
  return (
    <div className="council-rail">
      <span
        className={`council-rail-line${first ? ' council-rail-line--hidden' : ''}`}
        aria-hidden
      />
      <span className="council-rail-slot" aria-hidden />
      <span
        className={`council-rail-line${last ? ' council-rail-line--hidden' : ''}`}
        aria-hidden
      />
    </div>
  );
}

function SlotNode({
  slot,
  last,
}: {
  slot: CouncilSlotState;
  last?: boolean;
}) {
  const provider = getProviderConfig(slot.provider).label;
  return (
    <div className={`council-node council-node--${slot.role}`}>
      <Rail last={last} />
      <span
        className={`council-node-dot pipeline-step-circle pipeline-step-circle--${dotModifier(
          slot.status,
        )}`}
        aria-hidden
      >
        {slot.status === 'done' ? (
          <Check size={11} strokeWidth={3} />
        ) : slot.status === 'failed' ? (
          <X size={11} strokeWidth={3} />
        ) : null}
      </span>
      <div className="council-node-body">
        <div className="council-node-head">
          <strong>{slot.title}</strong>
          <span className="council-node-provider">
            {provider}
            {slot.label ? ` · Candidate ${slot.label}` : ''}
          </span>
        </div>
        <MiniSteps slot={slot} />
        <div
          className={`council-node-status council-node-status--${slot.status}`}
          title={slot.status === 'failed' ? slot.error : undefined}
        >
          {slot.status === 'failed' && slot.error
            ? slot.error
            : councilStatusLabel(slot.status)}
        </div>
      </div>
    </div>
  );
}

export function CouncilProgress({
  slots,
  onCancel,
  canceling = false,
}: CouncilProgressProps) {
  if (slots.length === 0) {
    return null;
  }

  const candidates = slots.filter((slot) => slot.role === 'candidate');
  const judge = slots.find((slot) => slot.role === 'judge') ?? null;
  const running = slots.some((slot) => ACTIVE_STATUSES.includes(slot.status));

  return (
    <div className="council-progress">
      <div className="council-progress-head">
        <span className="council-progress-title">LLM Council run</span>
        {onCancel ? (
          <button
            type="button"
            className="council-progress-cancel"
            onClick={onCancel}
            disabled={canceling}
          >
            <X size={13} />
            {canceling ? 'Cancelling…' : 'Cancel run'}
          </button>
        ) : null}
      </div>

      <div className={`council-tree${running ? ' council-tree--running' : ''}`}>
        {/* Trunk root */}
        <div className="council-node council-node--root">
          <Rail first />
          <span className="council-node-dot council-node-dot--root" aria-hidden>
            <GitBranch size={12} />
          </span>
          <div className="council-node-body">
            <div className="council-node-head">
              <strong>Council</strong>
              <span className="council-node-provider">
                {candidates.length} candidates · running in parallel
              </span>
            </div>
          </div>
        </div>

        {/* Parallel candidate branches */}
        {candidates.map((slot) => (
          <SlotNode key={slot.slotId} slot={slot} />
        ))}

        {/* Convergence + judge */}
        {judge ? (
          <>
            <div className="council-node council-node--merge">
              <Rail />
              <span className="council-node-dot council-node-dot--merge" aria-hidden>
                <GitMerge size={12} />
              </span>
              <div className="council-node-body council-node-body--merge">
                <span>Candidates converge into the judge</span>
              </div>
            </div>
            <SlotNode slot={judge} last />
          </>
        ) : null}
      </div>
    </div>
  );
}
