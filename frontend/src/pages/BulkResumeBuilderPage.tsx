import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  FileUp,
  Loader2,
  Trash2,
  Sparkles,
  Users,
  Briefcase,
  LayoutTemplate,
  SlidersHorizontal,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import type { RepoItem, RepositorySource } from '../types/repository';
import type { CouncilSlotState } from '../types/council';
import type { HistorySessionSnapshot } from '../types/historySession';
import type { EducationData } from '../types/education';
import type { AiProvider } from '../utils/aiProviders';
import { AI_PROVIDERS, getSavedProvider } from '../utils/aiProviders';
import {
  fetchRepositorySources,
  filterSendableSources,
  dedupeRepositorySources,
  isRepoWithinYears,
  sourceLabel,
  estimateSourceMaterialTokens,
} from '../utils/repositorySources';
import {
  loadResumeRenderSettings,
  mergeResumeRenderSettings,
  RESUME_RENDER_TEMPLATES,
  settingsToBuildTemplateId,
  buildSettingsInstructions,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import { getResumeBuildTemplate } from '../utils/resumeBuildStyle';
import { buildResumeFromRepositoryPrompt, getDefaultAiUserPrompt } from '../utils/aiPrompt';
import {
  parseBulkJobDescriptions,
  singleJobFromText,
  type ParsedJobDescription,
} from '../utils/bulkJobDescriptions';
import { extractTextFromFile } from '../utils/bulkImport';
import {
  runJob,
  buildInitialSlots,
  type CouncilRunConfig,
} from '../utils/councilRun';
import { createHistorySession } from '../utils/historySessions';
import { useAiBridge } from '../hooks/useAiBridge';
import { CouncilProgress } from '../components/CouncilProgress';
import '../components/Layout.css';
import './BulkResumeBuilderPage.css';

type SelectionMode = 'manual' | 'filter';
type GenerationMode = 'solitary' | 'council';

const STORAGE_KEY = 'bulk-resume-builder:v1';

interface PersistedConfig {
  rawJd: string;
  selectionMode: SelectionMode;
  selectedKeys: string[];
  repoMaxYears: number;
  genMode: GenerationMode;
  provider: AiProvider;
  candidateProviders: AiProvider[];
  judgeProvider: AiProvider;
}

function loadConfig(): Partial<PersistedConfig> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const sourceKey = (source: RepositorySource) => `${source.kind}:${source.id}`;

/** Mirror of the wizard's source-selection logic, using shared repo utils. */
function selectSources(
  selectionMode: SelectionMode,
  repoSources: RepositorySource[],
  repoRaw: RepoItem[],
  selectedKeys: Set<string>,
  repoMaxYears: number,
): RepositorySource[] {
  const all = dedupeRepositorySources(repoSources);
  if (selectionMode === 'manual') {
    return filterSendableSources(
      all.filter((source) => selectedKeys.has(sourceKey(source))),
    );
  }
  const filtered = repoRaw
    .filter((item) => item.mode === 'freewrite')
    .filter((item) => isRepoWithinYears(item, repoMaxYears))
    .map((item) => repoSources.find((source) => source.id === item.id))
    .filter((source): source is RepositorySource => Boolean(source?.sendable));
  return filterSendableSources(dedupeRepositorySources(filtered));
}

function providerLabel(id: AiProvider): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

const BATCH_CONCURRENCY = 3;

type JobStatus = 'queued' | 'running' | 'saved' | 'failed';

interface JobRunState {
  number: number;
  label: string;
  status: JobStatus;
  slots: CouncilSlotState[];
  error?: string;
  historyId?: string;
}

/** Compact UTC stamp for History titles, e.g. "Jul 24, 14:03". */
function compactStamp(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function jobStatusText(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Building…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Failed';
  }
}

export function BulkResumeBuilderPage() {
  const saved = useMemo(loadConfig, []);

  // ── Sources ───────────────────────────────────────────────────────────────
  const [repoSources, setRepoSources] = useState<RepositorySource[]>([]);
  const [repoRaw, setRepoRaw] = useState<RepoItem[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(
    saved.selectionMode ?? 'manual',
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(saved.selectedKeys ?? []),
  );
  const [repoMaxYears, setRepoMaxYears] = useState<number>(saved.repoMaxYears ?? 5);

  // ── Generation ──────────────────────────────────────────────────────────────
  const [genMode, setGenMode] = useState<GenerationMode>(saved.genMode ?? 'council');
  const [provider, setProvider] = useState<AiProvider>(
    saved.provider ?? getSavedProvider(),
  );
  const [candidateProviders, setCandidateProviders] = useState<AiProvider[]>(
    saved.candidateProviders ?? ['claude', 'chatgpt'],
  );
  const [judgeProvider, setJudgeProvider] = useState<AiProvider>(
    saved.judgeProvider ?? 'claude',
  );

  // ── Style (universal, applied to every job) ─────────────────────────────────
  const [settings, setSettings] = useState<ResumeRenderSettings>(() =>
    loadResumeRenderSettings(),
  );
  const patchSettings = (patch: Partial<ResumeRenderSettings>) =>
    setSettings((prev) => mergeResumeRenderSettings({ ...prev, ...patch }));

  // ── Job descriptions ────────────────────────────────────────────────────────
  const [rawJd, setRawJd] = useState<string>(saved.rawJd ?? '');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotices, setImportNotices] = useState<string[]>([]);
  const [labelOverrides, setLabelOverrides] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Generation run ──────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const { bridgeReady, sendPromptAndWait, sendPromptAsFileAndWait } = useAiBridge();
  const [education, setEducation] = useState<EducationData | null>(null);
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [jobStates, setJobStates] = useState<JobRunState[]>([]);
  const [openJobs, setOpenJobs] = useState<Set<number>>(new Set());
  const cancelRef = useRef(false);

  // ── Load repository sources on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingSources(true);
    fetchRepositorySources()
      .then(({ repo, repoRaw: raw }) => {
        if (cancelled) return;
        setRepoSources(repo);
        setRepoRaw(raw);
        setSourcesError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSourcesError(err instanceof Error ? err.message : 'Failed to load sources.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSources(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Persist lightweight config ──────────────────────────────────────────────
  useEffect(() => {
    const config: PersistedConfig = {
      rawJd,
      selectionMode,
      selectedKeys: [...selectedKeys],
      repoMaxYears,
      genMode,
      provider,
      candidateProviders,
      judgeProvider,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, [
    rawJd,
    selectionMode,
    selectedKeys,
    repoMaxYears,
    genMode,
    provider,
    candidateProviders,
    judgeProvider,
  ]);

  // ── Load education once (optional context for the prompt) ───────────────────
  useEffect(() => {
    let cancelled = false;
    fetch('/api/education')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EducationData | null) => {
        if (!cancelled) setEducation(data);
      })
      .catch(() => {
        /* education is optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const sendableSources = useMemo(
    () => filterSendableSources(dedupeRepositorySources(repoSources)),
    [repoSources],
  );
  const selectedSources = useMemo(
    () => selectSources(selectionMode, repoSources, repoRaw, selectedKeys, repoMaxYears),
    [selectionMode, repoSources, repoRaw, selectedKeys, repoMaxYears],
  );
  const sourceTokens = useMemo(
    () => estimateSourceMaterialTokens(selectedSources),
    [selectedSources],
  );

  const parsed = useMemo(() => parseBulkJobDescriptions(rawJd), [rawJd]);
  const jobs: ParsedJobDescription[] = useMemo(() => {
    const base =
      parsed.markerless && rawJd.trim() ? [singleJobFromText(rawJd)] : parsed.jobs;
    return base.map((job) => ({
      ...job,
      label: labelOverrides[job.number] ?? job.label,
    }));
  }, [parsed, rawJd, labelOverrides]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const toggleSource = (source: RepositorySource) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = sourceKey(source);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllSources = () =>
    setSelectedKeys(new Set(sendableSources.map(sourceKey)));
  const clearSources = () => setSelectedKeys(new Set());

  const setCandidateCount = (count: number) => {
    setCandidateProviders((prev) => {
      const next = [...prev];
      const pool: AiProvider[] = ['claude', 'chatgpt', 'gemini'];
      while (next.length < count) {
        next.push(pool.find((p) => !next.includes(p)) ?? 'claude');
      }
      return next.slice(0, count);
    });
  };
  const setCandidateProvider = (index: number, value: AiProvider) =>
    setCandidateProviders((prev) => prev.map((p, i) => (i === index ? value : p)));

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportError(null);
    const notices: string[] = [];
    let appended = '';
    try {
      for (const file of Array.from(files)) {
        const extracted = await extractTextFromFile(file);
        appended += (appended ? '\n\n' : '') + extracted.text.trim();
        notices.push(`${extracted.filename} (${extracted.source.toUpperCase()})`);
      }
      setRawJd((prev) => (prev.trim() ? `${prev.trim()}\n\n${appended}` : appended));
      setImportNotices(notices);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'File import failed.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Readiness ───────────────────────────────────────────────────────────────
  const candidatesUnique =
    new Set(candidateProviders).size === candidateProviders.length;
  const generationValid =
    genMode === 'solitary' ||
    (candidateProviders.length >= 2 && candidatesUnique);
  const ready =
    jobs.length > 0 && selectedSources.length > 0 && generationValid;

  const genSummary =
    genMode === 'solitary'
      ? `Single model · ${providerLabel(provider)}`
      : `Council · ${candidateProviders.map(providerLabel).join(' + ')} → judge ${providerLabel(judgeProvider)}`;

  // ── Batch run ───────────────────────────────────────────────────────────────
  const patchJob = (index: number, patch: Partial<JobRunState>) =>
    setJobStates((prev) =>
      prev.map((js, i) => (i === index ? { ...js, ...patch } : js)),
    );

  const patchSlot = (
    index: number,
    slotId: string,
    slotPatch: Partial<CouncilSlotState>,
  ) =>
    setJobStates((prev) =>
      prev.map((js, i) =>
        i === index
          ? {
              ...js,
              slots: js.slots.map((s) =>
                s.slotId === slotId ? { ...s, ...slotPatch } : s,
              ),
            }
          : js,
      ),
    );

  const startBatch = async () => {
    if (!ready || !bridgeReady || running) return;

    cancelRef.current = false;
    setCanceling(false);

    // Freeze inputs so mid-run edits don't affect the batch.
    const list = jobs;
    const sources = selectedSources;
    const runSettings = settings;
    const config: CouncilRunConfig = {
      genMode,
      provider,
      candidateProviders,
      judgeProvider,
    };
    const styleProfile = getResumeBuildTemplate(
      settingsToBuildTemplateId(runSettings.defaultTemplate),
    );
    const styleInstructions = buildSettingsInstructions(runSettings);
    const senders = { sendPromptAndWait, sendPromptAsFileAndWait };

    setJobStates(
      list.map((job) => ({
        number: job.number,
        label: job.label,
        status: 'queued' as JobStatus,
        slots: buildInitialSlots(config),
      })),
    );
    setOpenJobs(new Set());
    setStarted(true);
    setRunning(true);

    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= list.length) return;
        const job = list[index];
        if (cancelRef.current) {
          patchJob(index, { status: 'failed', error: 'Cancelled before start.' });
          continue;
        }
        patchJob(index, { status: 'running' });
        setOpenJobs((prev) => new Set(prev).add(index));
        try {
          const candidatePrompt = buildResumeFromRepositoryPrompt(
            job.text,
            sources,
            styleProfile,
            styleInstructions,
            education ?? undefined,
          );
          const result = await runJob({
            config,
            candidatePrompt,
            jobDescription: job.text,
            styleInstructions,
            sources,
            senders,
            onSlot: (slotId, slotPatch) => patchSlot(index, slotId, slotPatch),
            isCancelled: () => cancelRef.current,
          });

          const title = `Job Description ${job.number}${
            job.label ? ` — ${job.label}` : ''
          } (${compactStamp()})`;
          const snapshot: HistorySessionSnapshot = {
            resume: result.resume,
            jobDescription: job.text,
            linkedSession: result.linkedSession,
            showJdNotes: false,
            zoom: 1,
            aiUserPrompt: getDefaultAiUserPrompt(),
            renderSettings: runSettings,
            council: result.council,
          };
          const saved = await createHistorySession(title, snapshot);
          patchJob(index, { status: 'saved', historyId: saved.id });
        } catch (err) {
          // Skip immediately, log, continue (per the confirmed failure policy).
          const message = err instanceof Error ? err.message : 'Job failed.';
          patchJob(index, { status: 'failed', error: message });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(BATCH_CONCURRENCY, list.length) },
      () => worker(),
    );
    await Promise.all(workers);
    setRunning(false);
    setCanceling(false);
  };

  const cancelBatch = () => {
    cancelRef.current = true;
    setCanceling(true);
  };

  const resetBatch = () => {
    if (running) return;
    setStarted(false);
    setJobStates([]);
    setOpenJobs(new Set());
    setCanceling(false);
  };

  // ── Overall progress ────────────────────────────────────────────────────────
  const total = jobStates.length;
  const generated = jobStates.filter((j) => j.status === 'saved').length;
  const failedCount = jobStates.filter((j) => j.status === 'failed').length;
  const finished = generated + failedCount;
  const pct = total ? Math.round((generated / total) * 100) : 0;

  return (
    <div className="page bulk-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Layers size={22} className="bulk-title-icon" />
            Bulk ResumeBuilder
          </h1>
          <p className="page-subtitle">
            Paste or import many job descriptions, pick one universal set of
            experiences and settings, and (soon) generate a tailored resume for
            each — saved to History as <code>Job Description N</code>.
          </p>
        </div>
      </div>

      <div className="bulk-grid">
        {/* ── LEFT: universal settings ─────────────────────────────────────── */}
        <div className="bulk-col bulk-col--settings">
          {/* Sources */}
          <section className="card bulk-card">
            <header className="bulk-card-head">
              <Briefcase size={16} />
              <h2>Experiences</h2>
              <span className="bulk-card-sub">Same selection for every job</span>
            </header>

            <div className="bulk-seg">
              <button
                type="button"
                className={`bulk-seg-btn${selectionMode === 'manual' ? ' is-active' : ''}`}
                onClick={() => setSelectionMode('manual')}
              >
                Pick manually
              </button>
              <button
                type="button"
                className={`bulk-seg-btn${selectionMode === 'filter' ? ' is-active' : ''}`}
                onClick={() => setSelectionMode('filter')}
              >
                Recent years
              </button>
            </div>

            {loadingSources ? (
              <p className="bulk-muted">
                <Loader2 size={14} className="spin" /> Loading sources…
              </p>
            ) : sourcesError ? (
              <p className="bulk-error">{sourcesError}</p>
            ) : selectionMode === 'filter' ? (
              <label className="bulk-field">
                <span>Include freewrite entries from the last</span>
                <span className="bulk-inline">
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={repoMaxYears}
                    onChange={(e) =>
                      setRepoMaxYears(Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                  <span>years</span>
                </span>
              </label>
            ) : sendableSources.length === 0 ? (
              <p className="bulk-muted">
                No sendable (freewrite) sources yet. Add freewrite entries in the
                Repository tab.
              </p>
            ) : (
              <>
                <div className="bulk-source-actions">
                  <button type="button" className="bulk-link" onClick={selectAllSources}>
                    Select all
                  </button>
                  <button type="button" className="bulk-link" onClick={clearSources}>
                    Clear
                  </button>
                </div>
                <ul className="bulk-source-list">
                  {sendableSources.map((source) => {
                    const key = sourceKey(source);
                    const checked = selectedKeys.has(key);
                    return (
                      <li key={key}>
                        <label className="bulk-check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSource(source)}
                          />
                          <span className="bulk-check-box">
                            {checked ? <Check size={12} /> : null}
                          </span>
                          <span className="bulk-source-label">
                            {sourceLabel(source)}
                            <span className={`bulk-type bulk-type--${source.type}`}>
                              {source.type}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <footer className="bulk-card-foot">
              <span>
                <strong>{selectedSources.length}</strong> selected
              </span>
              <span className="bulk-muted">≈ {sourceTokens.toLocaleString()} tokens</span>
            </footer>
          </section>

          {/* Generation */}
          <section className="card bulk-card">
            <header className="bulk-card-head">
              <Sparkles size={16} />
              <h2>Generation</h2>
            </header>

            <div className="bulk-seg">
              <button
                type="button"
                className={`bulk-seg-btn${genMode === 'solitary' ? ' is-active' : ''}`}
                onClick={() => setGenMode('solitary')}
              >
                <Sparkles size={13} /> Single model
              </button>
              <button
                type="button"
                className={`bulk-seg-btn${genMode === 'council' ? ' is-active' : ''}`}
                onClick={() => setGenMode('council')}
              >
                <Users size={13} /> LLM Council
              </button>
            </div>

            {genMode === 'solitary' ? (
              <label className="bulk-field">
                <span>Model</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as AiProvider)}
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <div className="bulk-seg bulk-seg--sm">
                  <button
                    type="button"
                    className={`bulk-seg-btn${candidateProviders.length === 2 ? ' is-active' : ''}`}
                    onClick={() => setCandidateCount(2)}
                  >
                    2 candidates
                  </button>
                  <button
                    type="button"
                    className={`bulk-seg-btn${candidateProviders.length === 3 ? ' is-active' : ''}`}
                    onClick={() => setCandidateCount(3)}
                  >
                    3 candidates
                  </button>
                </div>
                {candidateProviders.map((cp, i) => (
                  <label className="bulk-field" key={i}>
                    <span>Candidate {i + 1}</span>
                    <select
                      value={cp}
                      onChange={(e) =>
                        setCandidateProvider(i, e.target.value as AiProvider)
                      }
                    >
                      {AI_PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="bulk-field">
                  <span>Judge</span>
                  <select
                    value={judgeProvider}
                    onChange={(e) => setJudgeProvider(e.target.value as AiProvider)}
                  >
                    {AI_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!candidatesUnique ? (
                  <p className="bulk-error">Each candidate must use a different model.</p>
                ) : (
                  <p className="bulk-muted bulk-rubric-note">
                    The judge gives each candidate an ATS score out of 100, then
                    writes the final resume.
                  </p>
                )}
              </>
            )}
          </section>

          {/* Style */}
          <section className="card bulk-card">
            <header className="bulk-card-head">
              <SlidersHorizontal size={16} />
              <h2>Build style</h2>
            </header>

            <label className="bulk-field">
              <span>
                <LayoutTemplate size={13} /> Content profile
              </span>
              <select
                value={settings.defaultTemplate}
                onChange={(e) =>
                  patchSettings({
                    defaultTemplate: e.target.value as ResumeRenderSettings['defaultTemplate'],
                  })
                }
              >
                {RESUME_RENDER_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="bulk-field-row">
              <label className="bulk-field">
                <span>Min bullets</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.minBulletsPerExperience}
                  onChange={(e) =>
                    patchSettings({
                      minBulletsPerExperience: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
              <label className="bulk-field">
                <span>Max bullets</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={settings.maxBulletsPerExperience}
                  onChange={(e) =>
                    patchSettings({
                      maxBulletsPerExperience: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </label>
            </div>

            <label className="bulk-field">
              <span>Special instructions</span>
              <textarea
                rows={3}
                value={settings.specialInstructions}
                onChange={(e) => patchSettings({ specialInstructions: e.target.value })}
                placeholder="Anything the model should always do for these resumes…"
              />
            </label>

            <p className="bulk-muted">
              Typography &amp; spacing come from your global Style settings in the
              Resume Builder.
            </p>
          </section>
        </div>

        {/* ── RIGHT: job descriptions ──────────────────────────────────────── */}
        <div className="bulk-col bulk-col--jds">
          <section className="card bulk-card bulk-card--jd">
            <header className="bulk-card-head">
              <Briefcase size={16} />
              <h2>Job descriptions</h2>
              <span className="bulk-card-sub">
                Separate each with a line like <code>Job Description 1</code>
              </span>
            </header>

            <div className="bulk-jd-toolbar">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <FileUp size={14} />
                )}
                Import file(s)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,.docx"
                multiple
                hidden
                onChange={(e) => handleFiles(e.target.files)}
              />
              <span className="bulk-muted">PDF, DOCX, or TXT — appended below</span>
              {rawJd ? (
                <button
                  type="button"
                  className="bulk-link bulk-link--danger"
                  onClick={() => {
                    setRawJd('');
                    setImportNotices([]);
                    setLabelOverrides({});
                  }}
                >
                  <Trash2 size={12} /> Clear
                </button>
              ) : null}
            </div>

            {importError ? <p className="bulk-error">{importError}</p> : null}
            {importNotices.length > 0 ? (
              <p className="bulk-notice">Imported: {importNotices.join(', ')}</p>
            ) : null}

            <textarea
              className="bulk-jd-textarea"
              value={rawJd}
              onChange={(e) => setRawJd(e.target.value)}
              spellCheck={false}
              placeholder={
                'Job Description 1 — Acme Corp, Senior Engineer\n<paste the full JD here>\n\nJob Description 2 — Globex, Product Manager\n<paste the full JD here>'
              }
            />

            {/* Parsed preview */}
            <div className="bulk-parsed">
              {rawJd.trim() === '' ? (
                <p className="bulk-muted">
                  Nothing pasted yet. Detected job descriptions will appear here.
                </p>
              ) : parsed.markerless ? (
                <p className="bulk-warn">
                  No <code>Job Description N</code> markers found — treating the
                  entire text as a single job description. Add markers to split it.
                </p>
              ) : (
                <p className="bulk-parsed-count">
                  Detected <strong>{jobs.length}</strong> job description
                  {jobs.length === 1 ? '' : 's'}.
                </p>
              )}

              <ul className="bulk-job-list">
                {jobs.map((job) => (
                  <li key={job.number} className="bulk-job">
                    <details>
                      <summary>
                        <span className="bulk-job-num">JD {job.number}</span>
                        <span className="bulk-job-label-text">
                          {job.label || 'Untitled'}
                        </span>
                        <span className="bulk-job-chars">
                          {job.text.length.toLocaleString()} chars
                        </span>
                      </summary>
                      <div className="bulk-job-body">
                        <label className="bulk-field bulk-job-label-field">
                          <span>Label (for your reference)</span>
                          <input
                            type="text"
                            value={job.label}
                            onChange={(e) =>
                              setLabelOverrides((prev) => ({
                                ...prev,
                                [job.number]: e.target.value,
                              }))
                            }
                            placeholder="Company / role"
                          />
                        </label>
                        <pre className="bulk-job-text">{job.text || '(empty)'}</pre>
                        <p className="bulk-muted bulk-job-saveas">
                          Saves to History as “Job Description {job.number}
                          {job.label ? ` — ${job.label}` : ''}” + timestamp.
                        </p>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>

      {/* ── Footer recap + start ────────────────────────────────────────────── */}
      {!started ? (
        <div className="bulk-footer card">
          <div className="bulk-footer-recap">
            <div className="bulk-checklist">
              <span className={jobs.length > 0 ? 'ok' : 'todo'}>
                {jobs.length > 0 ? <Check size={13} /> : null} {jobs.length} job
                {jobs.length === 1 ? '' : 's'}
              </span>
              <span className={selectedSources.length > 0 ? 'ok' : 'todo'}>
                {selectedSources.length > 0 ? <Check size={13} /> : null}{' '}
                {selectedSources.length} experience
                {selectedSources.length === 1 ? '' : 's'}
              </span>
              <span className={generationValid ? 'ok' : 'todo'}>
                {generationValid ? <Check size={13} /> : null} {genSummary}
              </span>
            </div>
            <p className="bulk-muted">
              Up to <strong>3 jobs build at once</strong> (3 tabs per model). Each
              finished resume autosaves to History so you can review them later.
            </p>
          </div>
          <div className="bulk-footer-cta">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!ready || !bridgeReady}
              onClick={startBatch}
            >
              <Sparkles size={15} /> Start bulk build
            </button>
            <span className="bulk-muted bulk-cta-note">
              {!bridgeReady
                ? 'Waiting for the browser extension — open this app in the browser where the extension is installed.'
                : ready
                  ? `Builds ${Math.min(BATCH_CONCURRENCY, jobs.length)} at a time. Keep this tab open until it finishes.`
                  : 'Add job descriptions and pick experiences to get ready.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="bulk-run card">
          <div className="bulk-run-head">
            <div className="bulk-progress">
              <div className="bulk-progress-head">
                <strong>{pct}% generated</strong>
                <span className="bulk-muted">
                  {generated}/{total} resumes
                  {failedCount > 0 ? ` · ${failedCount} failed` : ''}
                  {running ? ` · ${total - finished} left` : ''}
                </span>
              </div>
              <div className={`bulk-progress-track${running ? ' is-running' : ''}`}>
                <div
                  className="bulk-progress-seg bulk-progress-seg--ok"
                  style={{ width: `${total ? (generated / total) * 100 : 0}%` }}
                />
                <div
                  className="bulk-progress-seg bulk-progress-seg--fail"
                  style={{ width: `${total ? (failedCount / total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="bulk-run-actions">
              {running ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={cancelBatch}
                  disabled={canceling}
                >
                  <X size={14} /> {canceling ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : (
                <button type="button" className="btn btn--secondary" onClick={resetBatch}>
                  <RotateCcw size={14} /> New batch
                </button>
              )}
            </div>
          </div>

          <ul className="bulk-run-list">
            {jobStates.map((js, i) => (
              <li key={i}>
                <details
                  className="bulk-run-job"
                  open={openJobs.has(i)}
                  onToggle={(e) => {
                    const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                    setOpenJobs((prev) => {
                      if (prev.has(i) === isOpen) return prev; // no change → no re-render
                      const next = new Set(prev);
                      if (isOpen) next.add(i);
                      else next.delete(i);
                      return next;
                    });
                  }}
                >
                  <summary>
                    <span className="bulk-job-num">JD {js.number}</span>
                    <span className="bulk-job-label-text">
                      {js.label || 'Untitled'}
                    </span>
                    <span className={`bulk-run-status bulk-run-status--${js.status}`}>
                      {js.status === 'running' ? (
                        <Loader2 size={12} className="spin" />
                      ) : js.status === 'saved' ? (
                        <Check size={12} />
                      ) : js.status === 'failed' ? (
                        <X size={12} />
                      ) : null}
                      {jobStatusText(js.status)}
                    </span>
                  </summary>
                  <div className="bulk-run-job-body">
                    <CouncilProgress slots={js.slots} />
                    {js.error ? <p className="bulk-error">{js.error}</p> : null}
                    {js.historyId ? (
                      <button
                        type="button"
                        className="bulk-link"
                        onClick={() =>
                          navigate(`/resume?session=${encodeURIComponent(js.historyId!)}`)
                        }
                      >
                        Open in History →
                      </button>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
