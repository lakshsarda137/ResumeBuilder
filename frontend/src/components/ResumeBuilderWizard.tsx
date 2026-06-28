import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Clipboard,
  Database,
  Eye,
  FileUp,
  Link2,
  Loader2,
  Plug,
  Plus,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { EducationData } from '../types/education';
import type { OngoingItem, RepoItem, RepositorySource } from '../types/repository';
import type { ResumeData } from '../types/resume';
import type {
  CouncilCandidateFailure,
  CouncilCandidateResult,
  CouncilJudgeResult,
  CouncilPath,
  CouncilRunResult,
  CouncilSlotState,
  CouncilSnapshot,
  RubricDimension,
} from '../types/council';
import { CANDIDATE_LABELS } from '../types/council';
import {
  AI_PROVIDERS,
  getProviderConfig,
  getSavedProvider,
  saveProvider,
  type AiProvider,
} from '../utils/aiProviders';
import {
  buildOptimizePdfPrompt,
  buildResumeFromRepositoryPrompt,
  buildImprovementPrompt,
  buildCouncilJudgePrompt,
  buildCouncilRubricSummary,
  estimateWizardPromptTokens,
} from '../utils/aiPrompt';
import {
  createRubricDimension,
  keyRubric,
  loadDefaultRubric,
} from '../utils/councilSettings';
import {
  getResumeBuildTemplate,
} from '../utils/resumeBuildStyle';
import {
  RESUME_RENDER_TEMPLATES,
  buildSettingsInstructions,
  mergeResumeRenderSettings,
  parseCommaList,
  settingsToBuildTemplateId,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import {
  parseOptimizedPdfResponse,
  parseResumeFromLlmResponse,
  parseStrictGeneratedResume,
  parseCouncilJudgeResponse,
} from '../utils/parseResumeResponse';
import { readPdfFileAsBase64 } from '../utils/pdf';
import {
  fetchRepositorySources,
  dedupeRepositorySources,
  filterSendableSources,
  isOngoingOlderThanMonths,
  isRepoWithinYears,
  sourceLabel,
  estimateSourceMaterialTokens,
} from '../utils/repositorySources';
import { saveAiSession, touchAiSession } from '../utils/aiSessionStorage';
import {
  estimateInputTokens,
  formatCompactTokenEstimate,
} from '../utils/tokenEstimate';
import { AiResultModal, type CouncilModalData } from './AiResultModal';
import { CouncilProgress } from './CouncilProgress';
import { PipelineStatus } from './PipelineStatus';
import type { PipelineEvent, PipelineVariant } from '../utils/aiPipeline';
import './ResumeBuilderWizard.css';

type BuildMode = 'optimize' | 'repository';
type SelectionMode = 'manual' | 'filter';
type GenerationMode = 'solitary' | 'council';

const EMPTY_RESUME: ResumeData = { contact: { name: '', links: [] }, sections: [] };

type CandidateOutcome =
  | { ok: true; result: CouncilCandidateResult }
  | { ok: false; failure: CouncilCandidateFailure };

interface CouncilDisplay {
  preview: ResumeData;
  baseline: ResumeData | null;
  session: AiChatSession | null;
  rawResponse: string;
}

/** Resolve which resume / baseline / chat to show for the current council view. */
function computeCouncilDisplay(
  councilResult: CouncilRunResult | null,
  councilView: string,
): CouncilDisplay | null {
  if (!councilResult) {
    return null;
  }
  const { path, candidates, judge } = councilResult;

  if (councilView === 'final' && judge) {
    return {
      preview: judge.final,
      baseline: path === 'optimize' ? judge.finalBaseline : EMPTY_RESUME,
      session: judge.session,
      rawResponse: judge.rawResponse,
    };
  }

  const candidate =
    candidates.find((item) => item.slotId === councilView) ?? candidates[0];

  if (!candidate) {
    return judge
      ? {
          preview: judge.final,
          baseline: path === 'optimize' ? judge.finalBaseline : EMPTY_RESUME,
          session: judge.session,
          rawResponse: judge.rawResponse,
        }
      : null;
  }

  return {
    preview: candidate.resume,
    baseline: path === 'optimize' ? candidate.baseline : EMPTY_RESUME,
    // With a judge present, candidate views are read-only comparisons (refine is
    // the judge chat). Without a judge, the candidate's own chat is the link.
    session: judge ? null : candidate.session,
    rawResponse: candidate.rawResponse,
  };
}

interface ResumeBuilderWizardProps {
  currentResume: ResumeData;
  bridgeReady: boolean;
  connectedProvider: AiProvider | null;
  connectProvider: (provider: AiProvider) => Promise<void>;
  sendPdfAndWait: (args: {
    provider: AiProvider;
    prompt: string;
    pdfBase64: string;
    filename: string;
    forceNewChat?: boolean;
  }) => Promise<{
    ok: boolean;
    rawResponse?: string;
    session?: AiChatSession;
    error?: string;
  }>;
  sendPromptAndWait: (args: {
    provider: AiProvider;
    prompt: string;
  }) => Promise<{
    ok: boolean;
    rawResponse?: string;
    session?: AiChatSession;
    error?: string;
  }>;
  sendImprovementAndWait: (args: {
    session: AiChatSession;
    prompt: string;
  }) => Promise<{
    ok: boolean;
    rawResponse?: string;
    session?: AiChatSession;
    error?: string;
  }>;
  pushPipeline: (step: string, detail?: string) => void;
  startPipeline: (variant: PipelineVariant) => void;
  pipelineEvents: PipelineEvent[];
  pipelineVariant: PipelineVariant | null;
  onComplete: (
    data: ResumeData,
    session: AiChatSession | null,
    renderSettings?: ResumeRenderSettings,
    council?: CouncilSnapshot,
  ) => void;
  onSkipToEditor: () => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  renderSettings: ResumeRenderSettings;
}

function sourceKey(source: RepositorySource) {
  return `${source.kind}:${source.id}`;
}

function selectFilteredSources({
  selectionMode,
  repoSources,
  ongoingSources,
  repoRaw,
  ongoingRaw,
  selectedKeys,
  repoMaxYears,
  includeOngoing,
  ongoingMinMonths,
}: {
  selectionMode: SelectionMode;
  repoSources: RepositorySource[];
  ongoingSources: RepositorySource[];
  repoRaw: RepoItem[];
  ongoingRaw: OngoingItem[];
  selectedKeys: Set<string>;
  repoMaxYears: number;
  includeOngoing: boolean;
  ongoingMinMonths: number;
}) {
  const allSources = dedupeRepositorySources([...repoSources, ...ongoingSources]);

  if (selectionMode === 'manual') {
    return filterSendableSources(
      allSources.filter((source) => selectedKeys.has(sourceKey(source))),
    );
  }

  const repoFiltered = repoRaw
    .filter((item) => item.mode === 'freewrite')
    .filter((item) => isRepoWithinYears(item, repoMaxYears))
    .map((item) => repoSources.find((source) => source.id === item.id))
    .filter((source): source is RepositorySource => Boolean(source?.sendable));

  let ongoingFiltered: RepositorySource[] = [];
  if (includeOngoing) {
    ongoingFiltered = ongoingRaw
      .filter((item) => isOngoingOlderThanMonths(item, ongoingMinMonths))
      .map((item) => ongoingSources.find((source) => source.id === item.id))
      .filter((source): source is RepositorySource => Boolean(source?.sendable));
  }

  return filterSendableSources(
    dedupeRepositorySources([...repoFiltered, ...ongoingFiltered]),
  );
}

interface PromptEstimate {
  total: number;
  instructionTokens: number;
  sourceTokens: number;
  note: string;
}

interface RepositoryPromptDraft {
  prompt: string;
  selectedCount: number;
  sources: RepositorySource[];
}

interface PromptPreviewState {
  title: string;
  text: string;
}

type TypographyDraftKey =
  | 'textIntensity'
  | 'ruleIntensity'
  | 'bodyTextWeight'
  | 'boldTextWeight'
  | 'strongTextWeight';

const TYPOGRAPHY_FIELDS: Array<{
  key: TypographyDraftKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'textIntensity', label: 'PDF text intensity (%)', min: 65, max: 100, step: 1 },
  { key: 'ruleIntensity', label: 'PDF rule intensity (%)', min: 45, max: 100, step: 1 },
  { key: 'bodyTextWeight', label: 'Body weight (CSS)', min: 300, max: 500, step: 25 },
  { key: 'boldTextWeight', label: 'Bold weight (CSS)', min: 500, max: 800, step: 25 },
  { key: 'strongTextWeight', label: 'Strong keyword weight (CSS)', min: 500, max: 800, step: 25 },
];

function bulletDraftsFromSettings(settings: ResumeRenderSettings) {
  return {
    min: String(settings.minBulletsPerExperience),
    max: String(settings.maxBulletsPerExperience),
  };
}

function typographyDraftsFromSettings(settings: ResumeRenderSettings) {
  return Object.fromEntries(
    TYPOGRAPHY_FIELDS.map((field) => [field.key, String(settings[field.key])]),
  ) as Record<TypographyDraftKey, string>;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function TokenEstimatePanel({
  estimate,
  mode,
}: {
  estimate: PromptEstimate;
  mode: BuildMode;
}) {
  return (
    <div className="rb-wizard-token-card" aria-label="Estimated input tokens">
      <div className="rb-wizard-token-main">
        <span className="rb-wizard-token-icon">
          <Bot size={16} aria-hidden />
        </span>
        <div>
          <span>Estimated input</span>
          <strong>{formatCompactTokenEstimate(estimate.total)}</strong>
        </div>
      </div>
      <div className="rb-wizard-token-breakdown">
        <span>
          <strong>{formatCompactTokenEstimate(estimate.instructionTokens)}</strong>
          <em>Instructions + JD</em>
        </span>
        {mode === 'repository' ? (
          <span>
            <strong>{formatCompactTokenEstimate(estimate.sourceTokens)}</strong>
            <em>Source notes</em>
          </span>
        ) : (
          <span>
            <strong>Separate</strong>
            <em>PDF file</em>
          </span>
        )}
        <span className="rb-wizard-token-note">{estimate.note}</span>
      </div>
    </div>
  );
}

export function ResumeBuilderWizard({
  currentResume,
  bridgeReady,
  connectedProvider,
  connectProvider,
  sendPdfAndWait,
  sendPromptAndWait,
  sendImprovementAndWait,
  pushPipeline,
  startPipeline,
  pipelineEvents,
  pipelineVariant,
  onComplete,
  onSkipToEditor,
  jobDescription,
  onJobDescriptionChange,
  renderSettings,
}: ResumeBuilderWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<AiProvider>(getSavedProvider);
  const [connecting, setConnecting] = useState(false);
  const [working, setWorking] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<BuildMode | null>(null);

  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [repoSources, setRepoSources] = useState<RepositorySource[]>([]);
  const [ongoingSources, setOngoingSources] = useState<RepositorySource[]>([]);
  const [repoRaw, setRepoRaw] = useState<RepoItem[]>([]);
  const [ongoingRaw, setOngoingRaw] = useState<OngoingItem[]>([]);
  const [educationData, setEducationData] = useState<EducationData | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);

  const [selectionMode, setSelectionMode] = useState<SelectionMode>('manual');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [repoMaxYears, setRepoMaxYears] = useState(5);
  const [includeOngoing, setIncludeOngoing] = useState(true);
  const [ongoingMinMonths, setOngoingMinMonths] = useState(3);
  const [draftSettings, setDraftSettings] = useState(() =>
    mergeResumeRenderSettings(renderSettings),
  );
  const [bulletDrafts, setBulletDrafts] = useState(() =>
    bulletDraftsFromSettings(mergeResumeRenderSettings(renderSettings)),
  );
  const [typographyDrafts, setTypographyDrafts] = useState(() =>
    typographyDraftsFromSettings(mergeResumeRenderSettings(renderSettings)),
  );
  const [focusedTypographyField, setFocusedTypographyField] =
    useState<TypographyDraftKey | null>(null);

  const [previewData, setPreviewData] = useState<ResumeData | null>(null);
  const [baselineData, setBaselineData] = useState<ResumeData | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [activeSession, setActiveSession] = useState<AiChatSession | null>(null);
  const [promptPreview, setPromptPreview] = useState<PromptPreviewState | null>(null);
  const [previewingPrompt, setPreviewingPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [resultVariant, setResultVariant] = useState<'optimize' | 'repository'>(
    'optimize',
  );

  // --- LLM Council state ---------------------------------------------------
  const [genMode, setGenMode] = useState<GenerationMode>('solitary');
  const [candidateProviders, setCandidateProviders] = useState<AiProvider[]>([
    'claude',
    'chatgpt',
  ]);
  const [judgeProvider, setJudgeProvider] = useState<AiProvider>('gemini');
  const [rubric, setRubric] = useState<RubricDimension[]>(loadDefaultRubric);
  const [councilSlots, setCouncilSlots] = useState<CouncilSlotState[]>([]);
  const [councilActive, setCouncilActive] = useState(false);
  const [councilResult, setCouncilResult] = useState<CouncilRunResult | null>(null);
  const [councilView, setCouncilView] = useState<string>('final');
  const councilRunIdRef = useRef(0);

  const keyedRubric = useMemo(() => keyRubric(rubric), [rubric]);

  useEffect(() => {
    const next = mergeResumeRenderSettings(renderSettings);
    setDraftSettings(next);
    setBulletDrafts(bulletDraftsFromSettings(next));
    setTypographyDrafts((current) => {
      const nextDrafts = typographyDraftsFromSettings(next);
      if (!focusedTypographyField) {
        return nextDrafts;
      }
      return {
        ...nextDrafts,
        [focusedTypographyField]: current[focusedTypographyField],
      };
    });
  }, [focusedTypographyField, renderSettings]);

  const updateDraftSettings = useCallback(
    (patch: Partial<ResumeRenderSettings>) => {
      setDraftSettings((prev) => mergeResumeRenderSettings({ ...prev, ...patch }));
    },
    [],
  );

  const updateBulletDraftSettings = useCallback(
    (
      field: 'minBulletsPerExperience' | 'maxBulletsPerExperience',
      rawValue: string,
    ) => {
      setBulletDrafts((current) => ({
        ...current,
        [field === 'minBulletsPerExperience' ? 'min' : 'max']: rawValue,
      }));

      if (!rawValue.trim()) {
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return;
      }

      const patch: Partial<ResumeRenderSettings> = {};
      if (field === 'minBulletsPerExperience') {
        const minBullets = clampInteger(numericValue, 1, 5);
        patch.minBulletsPerExperience = minBullets;
        if (draftSettings.maxBulletsPerExperience < minBullets) {
          patch.maxBulletsPerExperience = minBullets;
        }
      } else {
        const maxBullets = clampInteger(numericValue, 1, 6);
        patch.maxBulletsPerExperience = maxBullets;
        if (draftSettings.minBulletsPerExperience > maxBullets) {
          patch.minBulletsPerExperience = maxBullets;
        }
      }

      const next = mergeResumeRenderSettings({ ...draftSettings, ...patch });
      setDraftSettings(next);
      setBulletDrafts({
        min:
          field === 'minBulletsPerExperience'
            ? rawValue
            : String(next.minBulletsPerExperience),
        max:
          field === 'maxBulletsPerExperience'
            ? rawValue
            : String(next.maxBulletsPerExperience),
      });
    },
    [draftSettings],
  );

  const syncBulletDrafts = useCallback(() => {
    setBulletDrafts(bulletDraftsFromSettings(draftSettings));
  }, [draftSettings]);

  const updateTypographyDraftSetting = useCallback(
    (
      field: TypographyDraftKey,
      rawValue: string,
      min: number,
      max: number,
    ) => {
      setTypographyDrafts((current) => ({
        ...current,
        [field]: rawValue,
      }));

      if (!rawValue.trim()) {
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) {
        return;
      }

      updateDraftSettings({ [field]: numericValue });
    },
    [updateDraftSettings],
  );

  const syncTypographyDraft = useCallback(
    (field: TypographyDraftKey) => {
      setFocusedTypographyField(null);
      setTypographyDrafts((current) => ({
        ...current,
        [field]: String(draftSettings[field]),
      }));
    },
    [draftSettings],
  );

  useEffect(() => {
    if (mode !== 'repository') {
      return;
    }

    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setLoadingSources(true);
      Promise.all([
        fetchRepositorySources(),
        fetch('/api/education').then(async (res) => {
          if (!res.ok) {
            throw new Error('Failed to load education records.');
          }
          return (await res.json()) as EducationData;
        }),
      ])
        .then(([{ repo, ongoing, repoRaw, ongoingRaw }, education]) => {
          if (cancelled) {
            return;
          }
          setRepoSources(repo);
          setOngoingSources(ongoing);
          setRepoRaw(repoRaw);
          setOngoingRaw(ongoingRaw);
          setEducationData(education);
          const defaults = new Set<string>();
          [...repo, ...ongoing]
            .filter((source) => source.sendable)
            .forEach((source) => defaults.add(sourceKey(source)));
          setSelectedKeys(defaults);
        })
        .catch((err) => {
          if (cancelled) {
            return;
          }
          setError(err instanceof Error ? err.message : 'Failed to load sources.');
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingSources(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const allSources = useMemo(
    () => dedupeRepositorySources([...repoSources, ...ongoingSources]),
    [repoSources, ongoingSources],
  );

  const filteredSources = useMemo(() => selectFilteredSources({
    selectionMode,
    repoSources,
    ongoingSources,
    repoRaw,
    ongoingRaw,
    selectedKeys,
    repoMaxYears,
    includeOngoing,
    ongoingMinMonths,
  }), [
    selectionMode,
    repoSources,
    ongoingSources,
    repoRaw,
    ongoingRaw,
    selectedKeys,
    repoMaxYears,
    includeOngoing,
    ongoingMinMonths,
  ]);

  const selectedTemplate = useMemo(
    () => getResumeBuildTemplate(settingsToBuildTemplateId(draftSettings.defaultTemplate)),
    [draftSettings.defaultTemplate],
  );

  const generationInstructions = useMemo(
    () => buildSettingsInstructions(draftSettings),
    [draftSettings],
  );

  const promptEstimate = useMemo(() => {
    if (mode === 'optimize') {
      const prompt = buildOptimizePdfPrompt(jobDescription);
      const { promptTokens } = estimateWizardPromptTokens(
        prompt,
        true,
      );
      return {
        total: promptTokens,
        instructionTokens: promptTokens,
        sourceTokens: 0,
        note: 'PDF file is counted separately by the provider.',
      };
    }

    if (mode === 'repository') {
      const prompt = buildResumeFromRepositoryPrompt(
        jobDescription,
        filteredSources,
        selectedTemplate,
        generationInstructions,
        educationData ?? undefined,
      );
      const { promptTokens } = estimateWizardPromptTokens(prompt, false);
      const sourceTokens = estimateSourceMaterialTokens(filteredSources);
      return {
        total: promptTokens,
        instructionTokens: Math.max(0, promptTokens - sourceTokens),
        sourceTokens,
        note: `${filteredSources.length} source${filteredSources.length === 1 ? '' : 's'} selected.`,
      };
    }

    const promptTokens = estimateWizardPromptTokens(jobDescription, false).promptTokens;
    return {
      total: promptTokens,
      instructionTokens: promptTokens,
      sourceTokens: 0,
      note: 'Choose a build mode to estimate the full send.',
    };
  }, [
    mode,
    jobDescription,
    filteredSources,
    educationData,
    selectedTemplate,
    generationInstructions,
  ]);

  const toggleSource = (source: RepositorySource) => {
    const key = sourceKey(source);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connectProvider(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect.');
    } finally {
      setConnecting(false);
    }
  };

  const buildFreshRepositoryPrompt = useCallback(async (): Promise<RepositoryPromptDraft> => {
    const [
      { repo, ongoing, repoRaw: freshRepoRaw, ongoingRaw: freshOngoingRaw },
      freshEducationData,
    ] = await Promise.all([
      fetchRepositorySources(),
      fetch('/api/education').then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to refresh education records.');
        }
        return (await res.json()) as EducationData;
      }),
    ]);

    setRepoSources(repo);
    setOngoingSources(ongoing);
    setRepoRaw(freshRepoRaw);
    setOngoingRaw(freshOngoingRaw);
    setEducationData(freshEducationData);

    const latestFilteredSources = selectFilteredSources({
      selectionMode,
      repoSources: repo,
      ongoingSources: ongoing,
      repoRaw: freshRepoRaw,
      ongoingRaw: freshOngoingRaw,
      selectedKeys,
      repoMaxYears,
      includeOngoing,
      ongoingMinMonths,
    });

    if (latestFilteredSources.length === 0) {
      throw new Error(
        'No sendable freewrite sources selected. Add freewrite entries in Repository/Ongoing or adjust filters.',
      );
    }

    return {
      selectedCount: latestFilteredSources.length,
      sources: latestFilteredSources,
      prompt: buildResumeFromRepositoryPrompt(
        jobDescription,
        latestFilteredSources,
        selectedTemplate,
        generationInstructions,
        freshEducationData,
      ),
    };
  }, [
    generationInstructions,
    includeOngoing,
    jobDescription,
    ongoingMinMonths,
    repoMaxYears,
    selectedKeys,
    selectedTemplate,
    selectionMode,
  ]);

  const runOptimizeFlow = useCallback(async () => {
    if (!pdfFile) {
      throw new Error('Select a PDF resume to optimize.');
    }

    const activeProvider = connectedProvider ?? provider;
    const { base64, filename } = await readPdfFileAsBase64(pdfFile);

    pushPipeline('reading_pdf', `Reading ${filename}…`);

    const response = await sendPdfAndWait({
      provider: activeProvider,
      prompt: buildOptimizePdfPrompt(jobDescription),
      pdfBase64: base64,
      filename,
      forceNewChat: true,
    });

    pushPipeline('parsing_json', 'Parsing extracted and optimized resume…');
    const { baseline, optimized } = parseOptimizedPdfResponse(response.rawResponse!);
    setBaselineData(baseline);

    if (!response.session) {
      throw new Error('No chat session captured during optimization.');
    }

    saveAiSession(response.session);
    setActiveSession(response.session);

    setPreviewData(optimized);
    setRawResponse(response.rawResponse!);
    setResultVariant('optimize');
    pushPipeline('preview_ready', 'Optimized resume preview ready');
  }, [
    connectedProvider,
    jobDescription,
    pdfFile,
    provider,
    pushPipeline,
    sendPdfAndWait,
  ]);

  const runRepositoryFlow = useCallback(async () => {
    pushPipeline('reading_sources', 'Refreshing saved repository sources…');
    const { prompt } = await buildFreshRepositoryPrompt();

    const activeProvider = connectedProvider ?? provider;

    pushPipeline('importing_pdf', 'Sending repository sources to Web AI…');
    const response = await sendPromptAndWait({
      provider: activeProvider,
      prompt,
    });

    pushPipeline('parsing_json', 'Parsing generated resume…');
    const emptyBaseline: ResumeData = { contact: { name: '', links: [] }, sections: [] };
    const generated = parseStrictGeneratedResume(response.rawResponse!);

    setBaselineData(emptyBaseline);
    setPreviewData(generated);
    setRawResponse(response.rawResponse!);
    setResultVariant('repository');

    if (response.session) {
      saveAiSession(response.session);
      setActiveSession(response.session);
    }

    pushPipeline('preview_ready', 'Repository resume preview ready');
  }, [
    buildFreshRepositoryPrompt,
    connectedProvider,
    provider,
    pushPipeline,
    sendPromptAndWait,
  ]);

  const handlePreviewPrompt = async () => {
    if (!mode) {
      setError('Choose how you want to build your resume.');
      return;
    }

    setPreviewingPrompt(true);
    setPromptCopied(false);
    setError(null);

    try {
      let title = 'Prompt Preview';
      let text = '';

      if (mode === 'optimize') {
        text = buildOptimizePdfPrompt(jobDescription);
      } else {
        const { prompt, selectedCount } = await buildFreshRepositoryPrompt();
        title = `Prompt Preview · ${selectedCount} source${selectedCount === 1 ? '' : 's'}`;
        text = prompt;
      }

      if (genMode === 'council') {
        title = `${title} · Council`;
        text = `CANDIDATE PROMPT — sent to each of the ${candidateProviders.length} candidate providers:\n\n${text}\n\n${'='.repeat(48)}\nRUBRIC SUMMARY SENT TO THE JUDGE\n${'='.repeat(48)}\n${buildCouncilRubricSummary(keyedRubric)}`;
      }

      setPromptPreview({ title, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build prompt preview.');
    } finally {
      setPreviewingPrompt(false);
    }
  };

  const copyPromptPreview = async () => {
    if (!promptPreview?.text) {
      return;
    }

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = promptPreview.text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    };

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(promptPreview.text);
      } catch {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }

    setPromptCopied(true);
    window.setTimeout(() => setPromptCopied(false), 1600);
  };

  const handleGenerate = async () => {
    if (!bridgeReady) {
      setError('Extension bridge required. Reload extension, then refresh (Cmd+R).');
      return;
    }
    if (!mode) {
      setError('Choose how you want to build your resume.');
      return;
    }

    setWorking(true);
    setError(null);
    startPipeline(mode === 'optimize' ? 'optimize' : 'write');

    try {
      if (mode === 'optimize') {
        await runOptimizeFlow();
      } else {
        await runRepositoryFlow();
      }
    } catch (err) {
      pushPipeline('error', err instanceof Error ? err.message : 'Failed');
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    const inCouncil = councilResult !== null;
    const session = inCouncil
      ? councilDisplay?.session ?? null
      : activeSession;
    const base = inCouncil ? councilDisplay?.preview ?? null : previewData;

    if (!session || !base) {
      return;
    }

    setRefining(true);
    setError(null);
    if (!inCouncil) {
      startPipeline('improvement');
      pushPipeline('returning_to_chat', `Returning to chat "${session.chatTitle}"…`);
    }

    try {
      const prompt = buildImprovementPrompt(instruction, base);
      const response = await sendImprovementAndWait({ session, prompt });

      touchAiSession(session.id);
      if (!inCouncil) {
        pushPipeline('parsing_json', 'Parsing refined resume…');
      }

      const parsed = parseResumeFromLlmResponse(response.rawResponse!, base);

      if (response.session) {
        saveAiSession(response.session);
      }

      if (inCouncil) {
        const nextSession = response.session ?? session;
        const viewId = councilView;
        setCouncilResult((prev) => {
          if (!prev) {
            return prev;
          }
          if (viewId === 'final' && prev.judge) {
            return {
              ...prev,
              judge: {
                ...prev.judge,
                final: parsed,
                rawResponse: response.rawResponse!,
                session: nextSession,
              },
            };
          }
          return {
            ...prev,
            candidates: prev.candidates.map((candidate) =>
              candidate.slotId === viewId
                ? {
                    ...candidate,
                    resume: parsed,
                    rawResponse: response.rawResponse!,
                    session: nextSession,
                  }
                : candidate,
            ),
          };
        });
      } else {
        if (response.session) {
          setActiveSession(response.session);
        }
        setPreviewData(parsed);
        setRawResponse(response.rawResponse!);
        pushPipeline('preview_ready', 'Preview updated');
      }
    } catch (err) {
      if (!inCouncil) {
        pushPipeline('error', err instanceof Error ? err.message : 'Failed');
      }
      setError(err instanceof Error ? err.message : 'Refinement failed.');
    } finally {
      setRefining(false);
    }
  };

  const handleApply = () => {
    if (councilResult && councilDisplay) {
      onComplete(
        councilDisplay.preview,
        councilDisplay.session,
        draftSettings,
        buildCouncilSnapshotFromRun(councilResult),
      );
      resetCouncil();
      setPreviewData(null);
      setBaselineData(null);
      setRawResponse('');
      return;
    }
    if (!previewData) {
      return;
    }
    onComplete(previewData, activeSession, draftSettings);
    setPreviewData(null);
    setBaselineData(null);
    setRawResponse('');
  };

  const handleDiscard = () => {
    if (councilResult) {
      resetCouncil();
    }
    setPreviewData(null);
    setBaselineData(null);
    setRawResponse('');
    setActiveSession(null);
  };

  // --- Council: candidate / judge / rubric configuration -------------------
  const setCandidateCount = useCallback((count: number) => {
    setCandidateProviders((prev) => {
      if (count === prev.length) {
        return prev;
      }
      if (count < prev.length) {
        return prev.slice(0, count);
      }
      const all: AiProvider[] = AI_PROVIDERS.map((item) => item.id);
      const next = [...prev];
      while (next.length < count) {
        const free = all.find((id) => !next.includes(id));
        if (!free) {
          break;
        }
        next.push(free);
      }
      return next;
    });
  }, []);

  const setCandidateProvider = useCallback(
    (index: number, provider: AiProvider) => {
      setCandidateProviders((prev) => {
        const next = [...prev];
        const existing = next.indexOf(provider);
        if (existing !== -1 && existing !== index) {
          // Keep candidates unique by swapping the conflicting slot.
          next[existing] = next[index];
        }
        next[index] = provider;
        return next;
      });
    },
    [],
  );

  const updateRubricDimension = useCallback(
    (id: string, patch: Partial<RubricDimension>) => {
      setRubric((prev) =>
        prev.map((dim) => (dim.id === id ? { ...dim, ...patch } : dim)),
      );
    },
    [],
  );

  const removeRubricDimension = useCallback((id: string) => {
    setRubric((prev) => prev.filter((dim) => dim.id !== id));
  }, []);

  const addRubricDimension = useCallback(() => {
    setRubric((prev) => [...prev, createRubricDimension()]);
  }, []);

  const resetRubricToDefaults = useCallback(() => {
    setRubric(loadDefaultRubric());
  }, []);

  // --- Council: orchestration ----------------------------------------------
  const setCouncilSlot = useCallback(
    (runId: number, slotId: string, patch: Partial<CouncilSlotState>) => {
      if (runId !== councilRunIdRef.current) {
        return;
      }
      setCouncilSlots((prev) =>
        prev.map((slot) =>
          slot.slotId === slotId ? { ...slot, ...patch } : slot,
        ),
      );
    },
    [],
  );

  const resetCouncil = useCallback(() => {
    councilRunIdRef.current += 1;
    setCouncilResult(null);
    setCouncilSlots([]);
    setCouncilActive(false);
    setCouncilView('final');
  }, []);

  const runCouncilCandidate = useCallback(
    async ({
      runId,
      slotId,
      provider,
      path,
      candidatePrompt,
      pdf,
    }: {
      runId: number;
      slotId: string;
      provider: AiProvider;
      path: CouncilPath;
      candidatePrompt: string;
      pdf: { base64: string; filename: string } | null;
    }): Promise<CandidateOutcome> => {
      const cancelled = (): CandidateOutcome => ({
        ok: false,
        failure: { slotId, provider, error: 'Cancelled.' },
      });

      setCouncilSlot(runId, slotId, { status: 'configuring' });
      // App-side heuristic: after a fresh chat usually opens, show "generating".
      const advanceTimer = window.setTimeout(() => {
        if (runId !== councilRunIdRef.current) {
          return;
        }
        setCouncilSlots((prev) =>
          prev.map((slot) =>
            slot.slotId === slotId && slot.status === 'configuring'
              ? { ...slot, status: 'generating' }
              : slot,
          ),
        );
      }, 5500);

      try {
        let resume: ResumeData;
        let baseline: ResumeData | null = null;
        let rawResponse = '';
        let session: AiChatSession | null = null;

        if (path === 'optimize') {
          const response = await sendPdfAndWait({
            provider,
            prompt: candidatePrompt,
            pdfBase64: pdf!.base64,
            filename: pdf!.filename,
            forceNewChat: true,
          });
          if (runId !== councilRunIdRef.current) {
            return cancelled();
          }
          if (!response.rawResponse) {
            throw new Error(response.error ?? 'No response captured.');
          }
          setCouncilSlot(runId, slotId, { status: 'parsing' });
          const parsed = parseOptimizedPdfResponse(response.rawResponse);
          resume = parsed.optimized;
          baseline = parsed.baseline;
          rawResponse = response.rawResponse;
          session = response.session ?? null;
        } else {
          const response = await sendPromptAndWait({
            provider,
            prompt: candidatePrompt,
          });
          if (runId !== councilRunIdRef.current) {
            return cancelled();
          }
          if (!response.rawResponse) {
            throw new Error(response.error ?? 'No response captured.');
          }
          setCouncilSlot(runId, slotId, { status: 'parsing' });
          resume = parseStrictGeneratedResume(response.rawResponse);
          rawResponse = response.rawResponse;
          session = response.session ?? null;
        }

        if (session) {
          saveAiSession(session);
        }
        setCouncilSlot(runId, slotId, { status: 'done' });
        return {
          ok: true,
          result: {
            slotId,
            provider,
            label: 'A',
            resume,
            baseline,
            rawResponse,
            session,
          },
        };
      } catch (err) {
        if (runId !== councilRunIdRef.current) {
          return cancelled();
        }
        const message = err instanceof Error ? err.message : 'Candidate failed.';
        setCouncilSlot(runId, slotId, { status: 'failed', error: message });
        return { ok: false, failure: { slotId, provider, error: message } };
      } finally {
        window.clearTimeout(advanceTimer);
      }
    },
    [sendPdfAndWait, sendPromptAndWait, setCouncilSlot],
  );

  const runCouncilFlow = useCallback(async () => {
    if (!bridgeReady) {
      setError('Extension bridge required. Reload extension, then refresh (Cmd+R).');
      return;
    }
    if (!mode) {
      setError('Choose how you want to build your resume.');
      return;
    }
    const providers = candidateProviders;
    if (new Set(providers).size !== providers.length) {
      setError('Each council candidate must use a different provider.');
      return;
    }
    const keyed = keyRubric(rubric);
    if (keyed.length === 0) {
      setError('Add at least one rubric dimension for the judge.');
      return;
    }
    if (mode === 'optimize' && !pdfFile) {
      setError('Select a PDF resume to optimize.');
      return;
    }

    setError(null);
    setWorking(true);
    setCouncilResult(null);
    setCouncilView('final');

    const runId = ++councilRunIdRef.current;
    const path: CouncilPath = mode === 'optimize' ? 'optimize' : 'repository';

    const initialSlots: CouncilSlotState[] = providers.map((provider, index) => ({
      slotId: `candidate-${index + 1}`,
      role: 'candidate',
      provider,
      title: `Candidate ${index + 1}`,
      status: 'configuring',
    }));
    initialSlots.push({
      slotId: 'judge',
      role: 'judge',
      provider: judgeProvider,
      title: 'Judge',
      status: 'waiting',
    });
    setCouncilActive(true);
    setCouncilSlots(initialSlots);

    try {
      let candidatePrompt = '';
      let pdf: { base64: string; filename: string } | null = null;
      let styleInstructions = '';
      let repositorySources: RepositorySource[] = [];

      if (path === 'optimize') {
        const { base64, filename } = await readPdfFileAsBase64(pdfFile!);
        pdf = { base64, filename };
        candidatePrompt = buildOptimizePdfPrompt(jobDescription);
      } else {
        const draft = await buildFreshRepositoryPrompt();
        candidatePrompt = draft.prompt;
        styleInstructions = generationInstructions;
        repositorySources = draft.sources;
      }
      if (runId !== councilRunIdRef.current) {
        return;
      }

      // Phase 1 — candidates in parallel.
      const outcomes = await Promise.all(
        providers.map((provider, index) =>
          runCouncilCandidate({
            runId,
            slotId: `candidate-${index + 1}`,
            provider,
            path,
            candidatePrompt,
            pdf,
          }),
        ),
      );
      if (runId !== councilRunIdRef.current) {
        return;
      }

      const successes: CouncilCandidateResult[] = [];
      const failures: CouncilCandidateFailure[] = [];
      for (const outcome of outcomes) {
        if (outcome.ok) {
          successes.push(outcome.result);
        } else if (outcome.failure.error !== 'Cancelled.') {
          failures.push(outcome.failure);
        }
      }

      // Assign anonymized labels A/B/C in slot order among successes.
      const labeled = successes.map((result, index) => ({
        ...result,
        label: CANDIDATE_LABELS[index],
      }));
      setCouncilSlots((prev) =>
        prev.map((slot) => {
          const match = labeled.find((item) => item.slotId === slot.slotId);
          return match ? { ...slot, label: match.label } : slot;
        }),
      );

      if (labeled.length < 2) {
        setCouncilSlot(runId, 'judge', {
          status: 'failed',
          error: 'Skipped — needs 2+ successful candidates.',
        });

        if (labeled.length === 0) {
          // All candidates failed: show errors only, keep failed rows visible.
          setCouncilActive(false);
          setError(
            `All ${providers.length} council candidates failed. ${failures
              .map((failure) => `${failure.provider}: ${failure.error}`)
              .join(' · ')}`,
          );
          return;
        }

        // Exactly one succeeded: skip the judge, let the user apply it.
        setCouncilResult({
          path,
          candidates: labeled,
          failures,
          judge: null,
          judgeError:
            'The council needs at least 2 successful candidates before the judge can run. You can apply the one candidate that succeeded.',
          rubric: keyed,
          judgeProvider,
          hadJobDescription: jobDescription.trim().length > 0,
        });
        setCouncilView(labeled[0].slotId);
        setCouncilActive(false);
        return;
      }

      // Phase 2 — judge (sequential).
      setCouncilSlot(runId, 'judge', { status: 'configuring' });
      const judgeTimer = window.setTimeout(() => {
        setCouncilSlot(runId, 'judge', { status: 'generating' });
      }, 5500);

      let judge: CouncilJudgeResult | null = null;
      let judgeError: string | null = null;
      const optimizeBaseline =
        path === 'optimize'
          ? labeled.find((item) => item.baseline)?.baseline ?? null
          : null;

      try {
        const judgePrompt = buildCouncilJudgePrompt({
          path,
          jobDescription,
          rubric: keyed,
          candidates: labeled.map((item) => ({
            label: item.label,
            resume: item.resume,
          })),
          styleInstructions,
          sources: path === 'repository' ? repositorySources : undefined,
        });
        const response = await sendPromptAndWait({
          provider: judgeProvider,
          prompt: judgePrompt,
        });
        window.clearTimeout(judgeTimer);
        if (runId !== councilRunIdRef.current) {
          return;
        }
        if (!response.rawResponse) {
          throw new Error(response.error ?? 'No judge response captured.');
        }
        setCouncilSlot(runId, 'judge', { status: 'parsing' });
        const parsed = parseCouncilJudgeResponse(
          response.rawResponse,
          optimizeBaseline,
        );
        if (response.session) {
          saveAiSession(response.session);
        }
        judge = {
          scores: parsed.scores,
          synthesisNotes: parsed.synthesisNotes,
          final: parsed.final,
          finalBaseline: optimizeBaseline,
          rawResponse: response.rawResponse,
          session: response.session ?? null,
        };
        setCouncilSlot(runId, 'judge', { status: 'done' });
      } catch (err) {
        window.clearTimeout(judgeTimer);
        if (runId !== councilRunIdRef.current) {
          return;
        }
        judgeError = err instanceof Error ? err.message : 'Judge failed.';
        setCouncilSlot(runId, 'judge', { status: 'failed', error: judgeError });
      }

      setCouncilResult({
        path,
        candidates: labeled,
        failures,
        judge,
        judgeError,
        rubric: keyed,
        judgeProvider,
        hadJobDescription: jobDescription.trim().length > 0,
      });
      setCouncilView(judge ? 'final' : labeled[0]?.slotId ?? 'final');
      setCouncilActive(false);
    } catch (err) {
      if (runId !== councilRunIdRef.current) {
        return;
      }
      setCouncilSlots((prev) =>
        prev.map((slot) =>
          slot.status === 'configuring' || slot.status === 'generating'
            ? { ...slot, status: 'failed', error: 'Run failed before completion.' }
            : slot,
        ),
      );
      setCouncilActive(false);
      setError(err instanceof Error ? err.message : 'Council run failed.');
    } finally {
      if (runId === councilRunIdRef.current) {
        setWorking(false);
      }
    }
  }, [
    bridgeReady,
    mode,
    candidateProviders,
    rubric,
    pdfFile,
    judgeProvider,
    jobDescription,
    buildFreshRepositoryPrompt,
    generationInstructions,
    runCouncilCandidate,
    sendPromptAndWait,
    setCouncilSlot,
  ]);

  const handleCancelCouncil = useCallback(() => {
    councilRunIdRef.current += 1;
    setCouncilActive(false);
    setCouncilSlots([]);
    setWorking(false);
  }, []);

  const buildCouncilSnapshotFromRun = useCallback(
    (result: CouncilRunResult): CouncilSnapshot => ({
      mode: 'council',
      providers: {
        candidates: candidateProviders,
        judge: judgeProvider,
      },
      rubricUsed: rubric.map((dim) => ({
        id: dim.id,
        title: dim.title,
        description: dim.description,
      })),
      candidateOutputs: result.candidates.map((candidate) => ({
        provider: candidate.provider,
        label: candidate.label,
        resume: candidate.resume,
      })),
      judgeOutput: result.judge
        ? {
            synthesisNotes: result.judge.synthesisNotes,
            scores: result.judge.scores,
          }
        : null,
      failures: result.failures,
    }),
    [candidateProviders, judgeProvider, rubric],
  );

  const councilDisplay = computeCouncilDisplay(councilResult, councilView);

  const councilModalData = useMemo<CouncilModalData | null>(() => {
    if (!councilResult) {
      return null;
    }
    const { candidates, judge, failures, judgeError } = councilResult;

    const tabs: CouncilModalData['tabs'] = [];
    if (judge) {
      tabs.push({ id: 'final', label: 'Final (Judge)' });
    }
    candidates.forEach((candidate) => {
      tabs.push({
        id: candidate.slotId,
        label: `Candidate: ${getProviderConfig(candidate.provider).label}`,
      });
    });

    let selected: CouncilModalData['selected'] = null;
    if (councilView !== 'final') {
      const candidate = candidates.find((item) => item.slotId === councilView);
      if (candidate) {
        const labelScores = judge?.scores[candidate.label];
        selected = {
          providerLabel: getProviderConfig(candidate.provider).label,
          candidateLabel: candidate.label,
          scores: councilResult.rubric.map((dim) => ({
            title: dim.title,
            score: labelScores?.scores[dim.key] ?? null,
            rationale: labelScores?.rationales[dim.key] ?? '',
          })),
        };
      }
    }

    return {
      tabs,
      view: councilView,
      onViewChange: setCouncilView,
      hasJudgeFinal: Boolean(judge),
      judgeError,
      synthesisNotes: judge?.synthesisNotes ?? '',
      noJobDescription: !councilResult.hadJobDescription,
      failures: failures.map((failure) => ({
        provider: getProviderConfig(failure.provider).label,
        error: failure.error,
      })),
      selected,
    };
  }, [councilResult, councilView]);

  const councilEstimate = useMemo(() => {
    if (genMode !== 'council' || !mode) {
      return null;
    }
    const path: CouncilPath = mode === 'optimize' ? 'optimize' : 'repository';
    const perCandidate =
      mode === 'optimize'
        ? estimateInputTokens(buildOptimizePdfPrompt(jobDescription))
        : promptEstimate.total;
    const candidateCount = candidateProviders.length;
    const candidateTotal = perCandidate * candidateCount;
    const judgeBase = estimateInputTokens(
      buildCouncilJudgePrompt({
        path,
        jobDescription,
        rubric: keyedRubric,
        candidates: [],
      }),
    );
    return {
      perCandidate,
      candidateCount,
      candidateTotal,
      judgeBase,
      total: candidateTotal + judgeBase,
      pdfSeparate: mode === 'optimize',
    };
  }, [
    genMode,
    mode,
    jobDescription,
    promptEstimate.total,
    candidateProviders.length,
    keyedRubric,
  ]);

  const renderTypographyControls = () => (
    <>
      {TYPOGRAPHY_FIELDS.map((field) => (
        <label key={field.key} className="rb-wizard-label">
          <span>{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            className="rb-wizard-input"
            value={typographyDrafts[field.key]}
            onFocus={() => setFocusedTypographyField(field.key)}
            onChange={(event) =>
              updateTypographyDraftSetting(
                field.key,
                event.target.value,
                field.min,
                field.max,
              )
            }
            onBlur={() => syncTypographyDraft(field.key)}
          />
        </label>
      ))}
    </>
  );

  return (
    <div className="rb-wizard">
      <header className="rb-wizard-header">
        <div>
          <h1>Resume Builder</h1>
          <p>Tailor a resume for a specific job using Web AI and your local data.</p>
        </div>
        <div className="rb-wizard-header-actions">
          <span
            className={`rb-wizard-badge ${bridgeReady ? 'rb-wizard-badge--ready' : ''}`}
          >
            {bridgeReady ? 'Bridge ready' : 'Extension needed'}
          </span>
          <button type="button" className="rb-wizard-link" onClick={onSkipToEditor}>
            Skip to editor
          </button>
        </div>
      </header>

      <section className="rb-wizard-section">
        <label className="rb-wizard-label">
          <span>Job description</span>
          <span className="rb-wizard-hint">
            Paste from the company website — used to tailor bullets and JD match notes.
          </span>
          <textarea
            className="rb-wizard-textarea"
            value={jobDescription}
            onChange={(e) => onJobDescriptionChange(e.target.value)}
            rows={6}
            placeholder="Paste the full job description here…"
          />
        </label>
      </section>

      <section className="rb-wizard-section">
        <h2>How do you want to start?</h2>
        <div className="rb-wizard-mode-grid">
          <button
            type="button"
            className={`rb-wizard-mode-card ${mode === 'optimize' ? 'rb-wizard-mode-card--active' : ''}`}
            onClick={() => setMode('optimize')}
          >
            <FileUp size={22} />
            <strong>Optimize existing resume</strong>
            <span>Upload your current PDF and optimize it for this job.</span>
          </button>
          <button
            type="button"
            className={`rb-wizard-mode-card ${mode === 'repository' ? 'rb-wizard-mode-card--active' : ''}`}
            onClick={() => setMode('repository')}
          >
            <Database size={22} />
            <strong>Build from repository</strong>
            <span>Generate a resume from freewrite notes in Repository & Ongoing.</span>
          </button>
        </div>
      </section>

      {mode === 'optimize' && (
        <section className="rb-wizard-section rb-wizard-panel rb-wizard-upload">
          <h3>Upload resume PDF</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="rb-wizard-file-input"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="rb-wizard-btn rb-wizard-btn--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={16} />
            {pdfFile ? pdfFile.name : 'Choose PDF file'}
          </button>
          <p className="rb-wizard-note">
            We extract your resume, then optimize it for the job description with action
            verbs, metrics, and honest JD keyword alignment.
          </p>
        </section>
      )}

      {mode === 'optimize' && (
        <section className="rb-wizard-section rb-wizard-panel">
          <h3>
            <SlidersHorizontal size={15} />
            PDF typography
          </h3>
          <p className="rb-wizard-note">
            These render settings carry into the optimized preview and final downloaded
            PDF.
          </p>
          <div className="rb-wizard-settings-grid">
            {renderTypographyControls()}
          </div>
        </section>
      )}

      {mode === 'repository' && (
        <>
          <section className="rb-wizard-section rb-wizard-panel">
            <h3>
              <SlidersHorizontal size={15} />
              Build settings
            </h3>
            <p className="rb-wizard-note">
              The LLM writes clean resume JSON once. These settings steer what content it
              chooses, then the app fits that JSON into whichever final format you pick.
            </p>
            <div className="rb-wizard-template-strip" aria-label="Default resume renderer">
              {RESUME_RENDER_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={`rb-wizard-render-card${draftSettings.defaultTemplate === template.id ? ' rb-wizard-render-card--active' : ''}`}
                  onClick={() => updateDraftSettings({ defaultTemplate: template.id })}
                >
                  <strong>{template.name}</strong>
                  <span>{template.summary}</span>
                </button>
              ))}
            </div>

            <div className="rb-wizard-settings-grid">
              <label className="rb-wizard-label">
                <span>Section headings</span>
                <input
                  className="rb-wizard-input"
                  value={draftSettings.sectionHeadings.join(', ')}
                  onChange={(event) =>
                    updateDraftSettings({
                      sectionHeadings: parseCommaList(event.target.value),
                    })
                  }
                />
              </label>
              <label className="rb-wizard-label">
                <span>Keyword emphasis terms</span>
                <input
                  className="rb-wizard-input"
                  value={draftSettings.keywordTerms.join(', ')}
                  onChange={(event) =>
                    updateDraftSettings({
                      keywordTerms: parseCommaList(event.target.value),
                    })
                  }
                />
              </label>
              <label className="rb-wizard-label">
                <span>Min bullets per experience</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  className="rb-wizard-input"
                  value={bulletDrafts.min}
                  onChange={(event) =>
                    updateBulletDraftSettings(
                      'minBulletsPerExperience',
                      event.target.value,
                    )
                  }
                  onBlur={syncBulletDrafts}
                />
              </label>
              <label className="rb-wizard-label">
                <span>Max bullets per experience</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  step={1}
                  className="rb-wizard-input"
                  value={bulletDrafts.max}
                  onChange={(event) =>
                    updateBulletDraftSettings(
                      'maxBulletsPerExperience',
                      event.target.value,
                    )
                  }
                  onBlur={syncBulletDrafts}
                />
              </label>
              {renderTypographyControls()}
            </div>

            <div className="rb-wizard-style-toggles">
              <label>
                <input
                  type="checkbox"
                  className="rb-wizard-checkbox"
                  checked={draftSettings.sectionHeadingItalic}
                  onChange={(event) =>
                    updateDraftSettings({ sectionHeadingItalic: event.target.checked })
                  }
                />
                <span>Italic section headings</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  className="rb-wizard-checkbox"
                  checked={draftSettings.entryTitleItalic}
                  onChange={(event) =>
                    updateDraftSettings({ entryTitleItalic: event.target.checked })
                  }
                />
                <span>Italic entry titles</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  className="rb-wizard-checkbox"
                  checked={draftSettings.subtitleItalic}
                  onChange={(event) =>
                    updateDraftSettings({ subtitleItalic: event.target.checked })
                  }
                />
                <span>Italic subtitles</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  className="rb-wizard-checkbox"
                  checked={draftSettings.dateItalic}
                  onChange={(event) =>
                    updateDraftSettings({ dateItalic: event.target.checked })
                  }
                />
                <span>Italic dates</span>
              </label>
            </div>

            <label className="rb-wizard-label rb-wizard-style-field">
              <span>Special notes for this build</span>
              <span className="rb-wizard-hint">
                Add anything to include, avoid, compress, or handle differently for this
                job. You can set permanent defaults on the Settings page.
              </span>
              <textarea
                className="rb-wizard-textarea rb-wizard-textarea--style"
                value={draftSettings.specialInstructions}
                onChange={(e) =>
                  updateDraftSettings({ specialInstructions: e.target.value })
                }
                rows={6}
              />
            </label>
          </section>

          <section className="rb-wizard-section rb-wizard-panel">
            <h3>Source material</h3>
            <p className="rb-wizard-note">
              Only <strong>freewrite</strong> repository entries are sent. Ongoing items use
              reflections (active) or compiled freewrite (done).
            </p>

            <div className="rb-wizard-tabs">
              <button
                type="button"
                className={`rb-wizard-tab ${selectionMode === 'manual' ? 'rb-wizard-tab--active' : ''}`}
                onClick={() => setSelectionMode('manual')}
              >
                Manual selection
              </button>
              <button
                type="button"
                className={`rb-wizard-tab ${selectionMode === 'filter' ? 'rb-wizard-tab--active' : ''}`}
                onClick={() => setSelectionMode('filter')}
              >
                Filter by age
              </button>
            </div>

            {loadingSources ? (
              <p className="rb-wizard-loading">
                <Loader2 size={14} className="spin" /> Loading repository…
              </p>
            ) : selectionMode === 'manual' ? (
              <div className="rb-wizard-source-list">
                {allSources.length === 0 ? (
                  <p className="rb-wizard-empty">No repository or ongoing items yet.</p>
                ) : (
                  allSources.map((source) => {
                    const key = sourceKey(source);
                    const disabled = !source.sendable;
                    return (
                      <label
                        key={key}
                        className={`rb-wizard-source-item ${disabled ? 'rb-wizard-source-item--disabled' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="rb-wizard-checkbox"
                          checked={selectedKeys.has(key)}
                          disabled={disabled}
                          onChange={() => toggleSource(source)}
                        />
                        <span>
                          {sourceLabel(source)}
                          {!source.sendable && (
                            <em className="rb-wizard-source-note">
                              {' '}
                              — not freewrite / empty
                            </em>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="rb-wizard-filters">
                <label className="rb-wizard-filter-row">
                  <span>Repository: include experiences at most</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={repoMaxYears}
                    onChange={(e) => setRepoMaxYears(Number(e.target.value) || 1)}
                  />
                  <span>years old</span>
                </label>
                <label className="rb-wizard-filter-row">
                  <input
                    type="checkbox"
                    className="rb-wizard-checkbox"
                    checked={includeOngoing}
                    onChange={(e) => setIncludeOngoing(e.target.checked)}
                  />
                  <span>Include ongoing items</span>
                </label>
                {includeOngoing && (
                  <label className="rb-wizard-filter-row">
                    <span>Ongoing: include if active for more than</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={ongoingMinMonths}
                      onChange={(e) =>
                        setOngoingMinMonths(Number(e.target.value) || 0)
                      }
                    />
                    <span>months</span>
                  </label>
                )}
                <p className="rb-wizard-filter-summary">
                  {filteredSources.length} source
                  {filteredSources.length === 1 ? '' : 's'} selected after filters
                </p>
              </div>
            )}

            <div className="rb-wizard-source-footer">
              {selectionMode === 'manual' ? (
                <p className="rb-wizard-source-summary">
                  {filteredSources.length} source
                  {filteredSources.length === 1 ? '' : 's'} selected
                </p>
              ) : null}
            </div>
          </section>
        </>
      )}

      {mode && (
        <section className="rb-wizard-section rb-wizard-panel rb-council">
          <div className="rb-council-mode" role="tablist" aria-label="Generation mode">
            <button
              type="button"
              role="tab"
              aria-selected={genMode === 'solitary'}
              className={`rb-council-mode-btn${genMode === 'solitary' ? ' rb-council-mode-btn--active' : ''}`}
              onClick={() => setGenMode('solitary')}
              disabled={working || refining}
            >
              <Bot size={15} />
              <span>
                <strong>Solitary LLM</strong>
                <em>One provider, one resume</em>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={genMode === 'council'}
              className={`rb-council-mode-btn${genMode === 'council' ? ' rb-council-mode-btn--active' : ''}`}
              onClick={() => setGenMode('council')}
              disabled={working || refining}
            >
              <Users size={15} />
              <span>
                <strong>LLM Council</strong>
                <em>2–3 candidates + a judge</em>
              </span>
            </button>
          </div>

          {genMode === 'council' && (
            <div className="rb-council-config">
              <p className="rb-wizard-note">
                Each candidate provider generates in parallel in its own background
                chat. A judge then scores the anonymized drafts on your rubric and
                merges the best into a final resume.
              </p>

              <div className="rb-council-pickers">
                <div className="rb-council-count">
                  <span className="rb-council-count-label">Candidates</span>
                  <div className="rb-council-count-toggle">
                    {[2, 3].map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`rb-council-count-btn${candidateProviders.length === count ? ' rb-council-count-btn--active' : ''}`}
                        onClick={() => setCandidateCount(count)}
                        disabled={working}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rb-council-slots">
                  {candidateProviders.map((slotProvider, index) => (
                    <label className="rb-council-slot" key={`candidate-${index}`}>
                      <span>Candidate {index + 1}</span>
                      <select
                        value={slotProvider}
                        disabled={working}
                        onChange={(event) =>
                          setCandidateProvider(
                            index,
                            event.target.value as AiProvider,
                          )
                        }
                      >
                        {AI_PROVIDERS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="rb-council-slot rb-council-slot--judge">
                    <span>Judge</span>
                    <select
                      value={judgeProvider}
                      disabled={working}
                      onChange={(event) =>
                        setJudgeProvider(event.target.value as AiProvider)
                      }
                    >
                      {AI_PROVIDERS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {candidateProviders.includes(judgeProvider) && (
                <p className="rb-council-hint">
                  Judge shares a provider with a candidate — it runs in a separate
                  chat and never sees which draft came from which provider.
                </p>
              )}

              <details className="rb-council-rubric">
                <summary>
                  Judge rubric · {keyedRubric.length} dimension
                  {keyedRubric.length === 1 ? '' : 's'} — override for this run
                </summary>
                <div className="rb-council-rubric-body">
                  <p className="rb-wizard-hint">
                    Overrides apply to this run only. Edit permanent defaults on the
                    Settings page. Each dimension is scored 1–10 with equal weight.
                  </p>
                  <div className="rb-council-rubric-header" aria-hidden="true">
                    <span>Title</span>
                    <span>Description (sent to the judge)</span>
                    <span />
                  </div>
                  {rubric.map((dimension) => (
                    <div className="rb-council-rubric-row" key={dimension.id}>
                      <input
                        className="rb-wizard-input"
                        placeholder="e.g. JD alignment"
                        aria-label="Dimension title"
                        value={dimension.title}
                        onChange={(event) =>
                          updateRubricDimension(dimension.id, {
                            title: event.target.value,
                          })
                        }
                      />
                      <input
                        className="rb-wizard-input"
                        placeholder="What the judge should look for"
                        aria-label="Dimension description"
                        value={dimension.description}
                        onChange={(event) =>
                          updateRubricDimension(dimension.id, {
                            description: event.target.value,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="rb-council-rubric-remove"
                        onClick={() => removeRubricDimension(dimension.id)}
                        aria-label={`Remove ${dimension.title || 'dimension'}`}
                        disabled={rubric.length <= 1}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="rb-council-rubric-actions">
                    <button
                      type="button"
                      className="rb-wizard-btn rb-wizard-btn--secondary"
                      onClick={addRubricDimension}
                    >
                      <Plus size={14} />
                      Add dimension
                    </button>
                    <button
                      type="button"
                      className="rb-wizard-link"
                      onClick={resetRubricToDefaults}
                    >
                      Reset to saved defaults
                    </button>
                  </div>
                </div>
              </details>

              {councilEstimate && (
                <div className="rb-council-estimate" aria-label="Council token estimate">
                  <div className="rb-council-estimate-total">
                    <span>Estimated input</span>
                    <strong>{formatCompactTokenEstimate(councilEstimate.total)}</strong>
                  </div>
                  <div className="rb-council-estimate-rows">
                    <span>
                      <strong>
                        {formatCompactTokenEstimate(councilEstimate.perCandidate)}
                      </strong>
                      <em>Per candidate</em>
                    </span>
                    <span>
                      <strong>
                        {formatCompactTokenEstimate(councilEstimate.candidateTotal)}
                      </strong>
                      <em>{councilEstimate.candidateCount} candidates</em>
                    </span>
                    <span>
                      <strong>
                        {formatCompactTokenEstimate(councilEstimate.judgeBase)}
                      </strong>
                      <em>Judge base</em>
                    </span>
                  </div>
                  <p className="rb-council-estimate-note">
                    {councilEstimate.pdfSeparate
                      ? 'PDF files are counted separately by each provider. '
                      : ''}
                    The judge also receives every candidate resume at run time
                    (~1–3k tokens each), added on top of the judge base.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rb-wizard-section rb-wizard-actions">
        {genMode === 'solitary' && (
          <div className="rb-wizard-provider-row">
            <label className="rb-wizard-field">
              <span>Web AI provider</span>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as AiProvider);
                  saveProvider(e.target.value as AiProvider);
                }}
              >
                {AI_PROVIDERS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rb-wizard-btn rb-wizard-btn--secondary"
              onClick={handleConnect}
              disabled={connecting || working || refining}
            >
              {connecting ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
              Connect
            </button>
          </div>
        )}

        {mode && genMode === 'solitary' && (
          <TokenEstimatePanel estimate={promptEstimate} mode={mode} />
        )}

        <div className="rb-wizard-action-buttons">
          <button
            type="button"
            className="rb-wizard-btn rb-wizard-btn--secondary"
            onClick={handlePreviewPrompt}
            disabled={!mode || working || refining || previewingPrompt}
          >
            {previewingPrompt ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Eye size={15} />
            )}
            {previewingPrompt ? 'Preparing…' : 'Preview prompt'}
          </button>
          <button
            type="button"
            className="rb-wizard-btn rb-wizard-btn--primary"
            onClick={() => {
              if (genMode === 'council') {
                void runCouncilFlow();
              } else {
                void handleGenerate();
              }
            }}
            disabled={
              !bridgeReady ||
              !mode ||
              working ||
              refining ||
              connecting ||
              previewingPrompt ||
              (mode === 'optimize' && !pdfFile)
            }
          >
            {working ? <Loader2 size={16} className="spin" /> : null}
            {working
              ? genMode === 'council'
                ? 'Running council…'
                : 'Generating…'
              : genMode === 'council'
                ? 'Run LLM Council'
                : 'Generate tailored resume'}
          </button>
        </div>

        {genMode === 'solitary' ? (
          <PipelineStatus events={pipelineEvents} variant={pipelineVariant} />
        ) : null}
        {councilSlots.length > 0 && !councilResult ? (
          <CouncilProgress
            slots={councilSlots}
            onCancel={councilActive ? handleCancelCouncil : undefined}
          />
        ) : null}

        {!bridgeReady && (
          <p className="rb-wizard-error">
            <Plug size={13} />
            Install/reload the Chrome extension, then refresh this page (Cmd+R).
          </p>
        )}
        {error && <p className="rb-wizard-error">{error}</p>}
      </section>

      <AiResultModal
        open={previewData !== null || councilResult !== null}
        variant={councilResult ? councilResult.path : resultVariant}
        baselineData={councilDisplay ? councilDisplay.baseline : baselineData}
        previewData={
          (councilDisplay ? councilDisplay.preview : previewData) ?? currentResume
        }
        rawResponse={councilDisplay ? councilDisplay.rawResponse : rawResponse}
        session={councilDisplay ? councilDisplay.session : activeSession}
        refining={refining}
        refinementChanges={null}
        renderSettings={draftSettings}
        onRenderSettingsChange={setDraftSettings}
        onApply={handleApply}
        onDiscard={handleDiscard}
        onRefine={handleRefine}
        council={councilModalData}
      />

      {promptPreview && (
        <div
          className="rb-prompt-preview-overlay"
          role="presentation"
          onClick={() => setPromptPreview(null)}
        >
          <div
            className="rb-prompt-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rb-prompt-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rb-prompt-preview-header">
              <h2 id="rb-prompt-preview-title">{promptPreview.title}</h2>
              <button
                type="button"
                className="rb-prompt-preview-icon-btn"
                onClick={() => setPromptPreview(null)}
                aria-label="Close prompt preview"
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              className="rb-prompt-preview-textarea"
              value={promptPreview.text}
              readOnly
              spellCheck={false}
            />
            <div className="rb-prompt-preview-actions">
              <button
                type="button"
                className="rb-wizard-btn rb-wizard-btn--secondary"
                onClick={() => void copyPromptPreview()}
              >
                <Clipboard size={14} />
                {promptCopied ? 'Copied' : 'Copy prompt'}
              </button>
              <button
                type="button"
                className="rb-wizard-btn rb-wizard-btn--primary"
                onClick={() => setPromptPreview(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
