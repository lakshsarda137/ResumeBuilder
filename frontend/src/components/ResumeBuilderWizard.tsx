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
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { EducationData } from '../types/education';
import type { OngoingItem, RepoItem, RepositorySource } from '../types/repository';
import type { ResumeData } from '../types/resume';
import {
  AI_PROVIDERS,
  getSavedProvider,
  saveProvider,
  type AiProvider,
} from '../utils/aiProviders';
import {
  buildOptimizePdfPrompt,
  buildResumeFromRepositoryPrompt,
  buildImprovementPrompt,
  estimateWizardPromptTokens,
} from '../utils/aiPrompt';
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
import { formatCompactTokenEstimate } from '../utils/tokenEstimate';
import { AiResultModal } from './AiResultModal';
import { PipelineStatus } from './PipelineStatus';
import type { PipelineEvent, PipelineVariant } from '../utils/aiPipeline';
import './ResumeBuilderWizard.css';

type BuildMode = 'optimize' | 'repository';
type SelectionMode = 'manual' | 'filter';

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
}

interface PromptPreviewState {
  title: string;
  text: string;
}

function bulletDraftsFromSettings(settings: ResumeRenderSettings) {
  return {
    min: String(settings.minBulletsPerExperience),
    max: String(settings.maxBulletsPerExperience),
  };
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

  useEffect(() => {
    const next = mergeResumeRenderSettings(renderSettings);
    setDraftSettings(next);
    setBulletDrafts(bulletDraftsFromSettings(next));
  }, [renderSettings]);

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
      if (mode === 'optimize') {
        setPromptPreview({
          title: 'Prompt Preview',
          text: buildOptimizePdfPrompt(jobDescription),
        });
        return;
      }

      const { prompt, selectedCount } = await buildFreshRepositoryPrompt();
      setPromptPreview({
        title: `Prompt Preview · ${selectedCount} source${selectedCount === 1 ? '' : 's'}`,
        text: prompt,
      });
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
    if (!activeSession || !previewData) {
      return;
    }

    setRefining(true);
    setError(null);
    startPipeline('improvement');
    pushPipeline('returning_to_chat', `Returning to chat "${activeSession.chatTitle}"…`);

    try {
      const prompt = buildImprovementPrompt(instruction, previewData);
      const response = await sendImprovementAndWait({
        session: activeSession,
        prompt,
      });

      touchAiSession(activeSession.id);
      pushPipeline('parsing_json', 'Parsing refined resume…');

      const parsed = parseResumeFromLlmResponse(
        response.rawResponse!,
        previewData,
      );

      if (response.session) {
        saveAiSession(response.session);
        setActiveSession(response.session);
      }

      setPreviewData(parsed);
      setRawResponse(response.rawResponse!);
      pushPipeline('preview_ready', 'Preview updated');
    } catch (err) {
      pushPipeline('error', err instanceof Error ? err.message : 'Failed');
      setError(err instanceof Error ? err.message : 'Refinement failed.');
    } finally {
      setRefining(false);
    }
  };

  const handleApply = () => {
    if (!previewData) {
      return;
    }
    onComplete(previewData, activeSession, draftSettings);
    setPreviewData(null);
    setBaselineData(null);
    setRawResponse('');
  };

  const handleDiscard = () => {
    setPreviewData(null);
    setBaselineData(null);
    setRawResponse('');
    setActiveSession(null);
  };

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

      <section className="rb-wizard-section rb-wizard-actions">
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

        {mode && (
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
            onClick={handleGenerate}
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
            {working ? 'Generating…' : 'Generate tailored resume'}
          </button>
        </div>

        <PipelineStatus events={pipelineEvents} variant={pipelineVariant} />

        {!bridgeReady && (
          <p className="rb-wizard-error">
            <Plug size={13} />
            Install/reload the Chrome extension, then refresh this page (Cmd+R).
          </p>
        )}
        {error && <p className="rb-wizard-error">{error}</p>}
      </section>

      <AiResultModal
        open={previewData !== null}
        variant={resultVariant}
        baselineData={baselineData}
        previewData={previewData ?? currentResume}
        rawResponse={rawResponse}
        session={activeSession}
        refining={refining}
        refinementChanges={null}
        renderSettings={draftSettings}
        onRenderSettingsChange={setDraftSettings}
        onApply={handleApply}
        onDiscard={handleDiscard}
        onRefine={handleRefine}
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
