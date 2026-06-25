export interface PipelineEvent {
  id: string;
  step: string;
  label: string;
  at: number;
}

export type PipelineVariant = 'optimize' | 'write' | 'edit_pdf' | 'improvement';

export type MilestoneStatus = 'pending' | 'active' | 'complete' | 'error';

export interface PipelineMilestone {
  id: string;
  label: string;
  status: MilestoneStatus;
}

const STEP_LABELS: Record<string, string> = {
  preparing_pdf: 'Preparing resume PDF…',
  reading_pdf: 'Reading selected PDF…',
  importing_pdf: 'Sending PDF for extraction…',
  opening_chat: 'Opening a fresh chat session…',
  chat_ready: 'Chat session ready',
  attaching_pdf: 'Attaching resume PDF…',
  pdf_attached: 'Resume PDF attached',
  pasting_prompt: 'Pasting edit instruction…',
  prompt_ready: 'Edit instruction ready',
  sending: 'Sending to model…',
  sent: 'Prompt sent — generating response…',
  waiting: 'Waiting for model response…',
  response_detected: 'Response detected',
  parsing_json: 'Parsing resume JSON…',
  preview_ready: 'Preview loaded on dashboard',
  returning_to_chat: 'Returning to the same chat…',
  improvement_sent: 'Improvement prompt sent',
  error: 'Something went wrong',
};

export const PIPELINE_VARIANT_MILESTONES: Record<
  PipelineVariant,
  Array<{ id: string; label: string }>
> = {
  optimize: [
    { id: 'chat', label: 'Configuring chat session' },
    { id: 'prompt', label: 'Preparing prompt' },
    { id: 'optimize', label: 'Extracting and optimizing resume' },
    { id: 'display', label: 'Displaying resume' },
  ],
  write: [
    { id: 'chat', label: 'Configuring chat session' },
    { id: 'prompt', label: 'Preparing prompt' },
    { id: 'write', label: 'Writing resume' },
    { id: 'display', label: 'Displaying resume' },
  ],
  edit_pdf: [
    { id: 'chat', label: 'Configuring chat session' },
    { id: 'prompt', label: 'Preparing prompt' },
    { id: 'apply', label: 'Applying AI edits' },
    { id: 'display', label: 'Displaying resume' },
  ],
  improvement: [
    { id: 'chat', label: 'Returning to chat session' },
    { id: 'prompt', label: 'Preparing prompt' },
    { id: 'refine', label: 'Applying improvements' },
    { id: 'display', label: 'Displaying resume' },
  ],
};

interface FlowState {
  completedThrough: number;
  sentCount: number;
  parseCount: number;
  errored: boolean;
}

function initialFlowState(): FlowState {
  return {
    completedThrough: -1,
    sentCount: 0,
    parseCount: 0,
    errored: false,
  };
}

/**
 * Only advance completedThrough on explicit completion signals — never on
 * in-progress extension micro-steps (waiting, attaching, etc.).
 */
function applyOptimizeEvent(event: PipelineEvent, state: FlowState) {
  const { step } = event;

  if (step === 'error') {
    state.errored = true;
    return;
  }

  if (step === 'chat_ready') {
    state.completedThrough = Math.max(state.completedThrough, 0);
    return;
  }

  if (step === 'sent') {
    state.sentCount += 1;
    return;
  }

  if (step === 'waiting') {
    if (state.sentCount === 1) {
      state.completedThrough = Math.max(state.completedThrough, 1);
    }
    return;
  }

  if (step === 'parsing_json') {
    state.parseCount += 1;
    if (state.parseCount >= 1) {
      state.completedThrough = Math.max(state.completedThrough, 2);
    }
    return;
  }

  if (step === 'preview_ready') {
    state.completedThrough = 3;
  }
}

function applyWriteEvent(event: PipelineEvent, state: FlowState) {
  const { step } = event;

  if (step === 'error') {
    state.errored = true;
    return;
  }

  if (step === 'chat_ready') {
    state.completedThrough = Math.max(state.completedThrough, 0);
    return;
  }

  if (step === 'sent') {
    state.sentCount += 1;
    return;
  }

  if (step === 'waiting') {
    if (state.sentCount === 1) {
      state.completedThrough = Math.max(state.completedThrough, 1);
    }
    return;
  }

  if (step === 'parsing_json') {
    state.completedThrough = Math.max(state.completedThrough, 2);
    return;
  }

  if (step === 'preview_ready') {
    state.completedThrough = 3;
  }
}

function applyEditPdfEvent(event: PipelineEvent, state: FlowState) {
  const { step } = event;

  if (step === 'error') {
    state.errored = true;
    return;
  }

  if (step === 'chat_ready') {
    state.completedThrough = Math.max(state.completedThrough, 0);
    return;
  }

  if (step === 'sent') {
    state.sentCount += 1;
    return;
  }

  if (step === 'waiting') {
    if (state.sentCount === 1) {
      state.completedThrough = Math.max(state.completedThrough, 1);
    }
    return;
  }

  if (step === 'parsing_json') {
    state.completedThrough = Math.max(state.completedThrough, 2);
    return;
  }

  if (step === 'preview_ready') {
    state.completedThrough = 3;
  }
}

function applyImprovementEvent(event: PipelineEvent, state: FlowState) {
  const { step } = event;

  if (step === 'error') {
    state.errored = true;
    return;
  }

  if (step === 'returning_to_chat') {
    state.completedThrough = Math.max(state.completedThrough, 0);
    return;
  }

  if (step === 'sent') {
    state.sentCount += 1;
    return;
  }

  if (step === 'waiting') {
    if (state.sentCount === 1) {
      state.completedThrough = Math.max(state.completedThrough, 1);
    }
    return;
  }

  if (step === 'parsing_json') {
    state.completedThrough = Math.max(state.completedThrough, 2);
    return;
  }

  if (step === 'preview_ready') {
    state.completedThrough = 3;
  }
}

function applyEvent(
  variant: PipelineVariant,
  event: PipelineEvent,
  state: FlowState,
) {
  switch (variant) {
    case 'optimize':
      applyOptimizeEvent(event, state);
      break;
    case 'write':
      applyWriteEvent(event, state);
      break;
    case 'edit_pdf':
      applyEditPdfEvent(event, state);
      break;
    case 'improvement':
      applyImprovementEvent(event, state);
      break;
    default:
      break;
  }
}

function statusesFromState(
  milestones: PipelineMilestone[],
  state: FlowState,
): PipelineMilestone[] {
  const lastIndex = milestones.length - 1;
  const finished = state.completedThrough >= lastIndex;

  if (finished && !state.errored) {
    return milestones.map((milestone) => ({
      ...milestone,
      status: 'complete',
    }));
  }

  const activeIndex = Math.min(state.completedThrough + 1, lastIndex);

  return milestones.map((milestone, index) => {
    if (state.errored && index === activeIndex) {
      return { ...milestone, status: 'error' };
    }
    if (index <= state.completedThrough) {
      return { ...milestone, status: 'complete' };
    }
    if (index === activeIndex) {
      return { ...milestone, status: 'active' };
    }
    return { ...milestone, status: 'pending' };
  });
}

/** Map raw pipeline events to Amazon-style milestone states. */
export function computeMilestoneStates(
  variant: PipelineVariant,
  events: PipelineEvent[],
): PipelineMilestone[] {
  const templates = PIPELINE_VARIANT_MILESTONES[variant];
  const milestones: PipelineMilestone[] = templates.map((template) => ({
    ...template,
    status: 'pending' as MilestoneStatus,
  }));

  if (events.length === 0) {
    milestones[0].status = 'active';
    return milestones;
  }

  const state = initialFlowState();

  for (const event of events) {
    applyEvent(variant, event, state);
  }

  return statusesFromState(milestones, state);
}

export function pipelineHasError(events: PipelineEvent[]): boolean {
  return events.some((event) => event.step === 'error');
}

export function labelForPipelineStep(step: string, detail?: string) {
  if (detail?.trim()) {
    return detail;
  }
  return STEP_LABELS[step] ?? step;
}

export function createPipelineEvent(step: string, detail?: string): PipelineEvent {
  return {
    id: `${step}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    step,
    label: labelForPipelineStep(step, detail),
    at: Date.now(),
  };
}

function stripElapsedSuffix(label: string) {
  return label.replace(/\s*\(\d+s\)\s*$/, '').trim();
}

/** Human-readable status line under the step tracker. */
export function pipelineStatusDetail(events: PipelineEvent[]): string {
  const latest = events[events.length - 1];
  if (!latest) {
    return '';
  }

  if (latest.step === 'error') {
    return latest.label;
  }

  return stripElapsedSuffix(latest.label);
}

/** Which milestone label best matches the current in-flight work. */
export function pipelineActiveMilestoneLabel(
  variant: PipelineVariant,
  events: PipelineEvent[],
): string | null {
  const milestones = computeMilestoneStates(variant, events);
  return milestones.find((milestone) => milestone.status === 'active')?.label ?? null;
}
