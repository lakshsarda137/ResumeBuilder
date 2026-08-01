import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  RotateCcw,
  Undo2,
  ZoomIn,
  ZoomOut,
  FileText,
  Loader2,
  Save,
  SlidersHorizontal,
  PlusCircle,
  X,
} from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { HistorySessionSnapshot } from '../types/historySession';
import type { CouncilSnapshot } from '../types/council';
import type { ResumeData } from '../types/resume';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import { CoverLetterWithJdNotes } from './CoverLetterWithJdNotes';
import { CoverLetterDocument } from './CoverLetterDocument';
import { useResumeState } from '../hooks/useResumeState';
import { useCoverLetterState } from '../hooks/useCoverLetterState';
import { useAiBridge } from '../hooks/useAiBridge';
import {
  exportResumeToPdf,
  inspectResumePageFit,
  type ResumePageFit,
} from '../utils/pdf';
import { resumeHasJdNotes, coverLetterHasJdNotes } from '../utils/jdNotes';
import {
  runCoverLetterGeneration,
  IDLE_COVER_LETTER_RUN,
  type CoverLetterRequest,
  type CoverLetterRunState,
} from '../utils/coverLetterRun';
import {
  deriveCoverLetterRenderSettings,
  type CoverLetterRenderSettings,
} from '../utils/coverLetterSettings';
import { buildCoverLetterSmallOverflowFitSettings } from '../utils/coverLetterFitModerator';
import {
  getDefaultAiUserPrompt,
  buildExpandResumePrompt,
  buildResumeBuildCoverPrompt,
} from '../utils/aiPrompt';
import { sendLargePromptAndWait } from '../utils/promptDelivery';

/** Attachment name for the expand task on truncating providers. */
const EXPAND_TASK_FILENAME = 'resume-expand-task.txt';
import type { RepositorySource } from '../types/repository';
import { parseResumeFromLlmResponse } from '../utils/parseResumeResponse';
import {
  buildSmallOverflowFitSettings,
  canModerateSmallOverflow,
  shouldSafetyCompress,
} from '../utils/resumeFitModerator';
import {
  RESUME_RENDER_TEMPLATES,
  loadResumeRenderSettings,
  mergeResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import {
  createHistorySession,
  fetchHistorySession,
  updateHistorySession,
} from '../utils/historySessions';
import { AiPanel } from './AiPanel';
import { ExpandResumeModal } from './ExpandResumeModal';
import { CouncilReviewModal } from './CouncilReviewModal';
import { FormatToolbar } from './FormatToolbar';
import { PipelineStatus } from './PipelineStatus';
import { ResumeBuilderWizard } from './ResumeBuilderWizard';
import { ResumeDocument } from './ResumeDocument';
import { ResumeRenderSettingsControls } from './ResumeRenderSettingsControls';
import { SaveSessionModal } from './SaveSessionModal';
import './ResumeEditor.css';

const SHOW_JD_NOTES_KEY = 'resume-editor-show-jd-notes';
/**
 * `useCoverLetterState` persists the letter itself, but "does this session have
 * a real letter, or just the empty-state template?" is editor state and would
 * otherwise reset on reload — leaving a generated letter in storage with no way
 * to switch to it.
 */
const HAS_COVER_LETTER_KEY = 'resume-editor-has-cover-letter';

function loadHasCoverLetter(): boolean {
  try {
    return localStorage.getItem(HAS_COVER_LETTER_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveHasCoverLetter(value: boolean) {
  try {
    localStorage.setItem(HAS_COVER_LETTER_KEY, String(value));
  } catch {
    // Local persistence is best-effort.
  }
}

function pageFitVariant(fit: ResumePageFit | null) {
  if (!fit) {
    return 'checking';
  }
  // Physically fits but sits above the safe fill line — flag as "tight".
  if (fit.status === 'fit' && !fit.safe) {
    return 'tight';
  }
  return fit.status;
}

function pageFitText(fit: ResumePageFit | null) {
  if (!fit) {
    return 'Checking page fit...';
  }
  // Show one decimal for overflow and tight zone so small improvements are visible
  const pct = fit.usageRatio >= 0.98
    ? `${(fit.usageRatio * 100).toFixed(1)}%`
    : `${Math.round(fit.usageRatio * 100)}%`;
  if (fit.status === 'over') {
    return `Over 1 page (${pct})`;
  }
  if (fit.status === 'under') {
    return `Under 1 page (${Math.round(fit.usageRatio * 100)}%)`;
  }
  if (!fit.safe) {
    return `Tight fit (${pct})`;
  }
  return `Fits 1 page (${Math.round(fit.usageRatio * 100)}%)`;
}

function pageFitTitle(fit: ResumePageFit | null) {
  if (!fit) {
    return 'Measured from the PDF export layout';
  }
  const base = `Measured from the PDF export layout: ${(fit.usageRatio * 100).toFixed(1)}% used`;
  if (fit.status !== 'over' && !fit.safe) {
    return `${base}. This is close to the page limit, so Download PDF gently compresses it to keep the last line on page one.`;
  }
  return base;
}

function loadShowJdNotes(): boolean {
  try {
    const stored = localStorage.getItem(SHOW_JD_NOTES_KEY);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  } catch {
    return true;
  }
}

export function ResumeEditor() {
  const [searchParams, setSearchParams] = useSearchParams();
  /**
   * Which document the canvas is showing. It also decides which document owns
   * the global ⌘Z handler — both state hooks register one, and leaving both
   * live would make an undo on the letter silently roll back the resume.
   */
  const [docView, setDocView] = useState<'resume' | 'cover-letter'>('resume');
  const { data, setData, undo, canUndo, reset, isSaving } = useResumeState({
    undoShortcutEnabled: docView === 'resume',
  });
  const {
    data: coverLetter,
    setData: setCoverLetter,
    undo: undoCoverLetter,
    canUndo: canUndoCoverLetter,
  } = useCoverLetterState({ undoShortcutEnabled: docView === 'cover-letter' });
  const didSeedRef = useRef(false);
  const loadedSessionRef = useRef<string | null>(null);
  const editorCanvasRef = useRef<HTMLElement | null>(null);
  const pendingEditorScrollRef = useRef(false);
  const [view, setView] = useState<'wizard' | 'editor'>('wizard');
  const [linkedSession, setLinkedSession] = useState<AiChatSession | null>(null);
  const [councilSnapshot, setCouncilSnapshot] = useState<CouncilSnapshot | null>(
    null,
  );
  const [councilReviewOpen, setCouncilReviewOpen] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [aiUserPrompt, setAiUserPrompt] = useState(getDefaultAiUserPrompt);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [historySessionTitle, setHistorySessionTitle] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [renderSettings, setRenderSettingsState] = useState(loadResumeRenderSettings);
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [pageFit, setPageFit] = useState<ResumePageFit | null>(null);
  const [fitModeratorNotice, setFitModeratorNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [exporting, setExporting] = useState(false);
  const [aiPanelBusy, setAiPanelBusy] = useState(false);
  const [showJdNotes, setShowJdNotes] = useState(loadShowJdNotes);
  const [expandModalOpen, setExpandModalOpen] = useState(false);
  const [expanding, setExpanding] = useState(false);

  // ── Cover letter ──────────────────────────────────────────────────────────
  /** False until this session has produced (or loaded) a real letter. */
  const [hasCoverLetter, setHasCoverLetterState] = useState(loadHasCoverLetter);
  const setHasCoverLetter = useCallback((value: boolean) => {
    setHasCoverLetterState(value);
    saveHasCoverLetter(value);
  }, []);
  const [coverLetterSession, setCoverLetterSession] = useState<AiChatSession | null>(null);
  const [coverLetterRun, setCoverLetterRun] =
    useState<CoverLetterRunState>(IDLE_COVER_LETTER_RUN);
  const [coverLetterFit, setCoverLetterFit] = useState<ResumePageFit | null>(null);
  const [coverLetterExporting, setCoverLetterExporting] = useState(false);
  /** Kept so "Regenerate" can re-run with the same inputs the wizard captured. */
  const coverLetterRequestRef = useRef<CoverLetterRequest | null>(null);
  const coverLetterRunIdRef = useRef(0);

  const scrollEditorToTop = useCallback(() => {
    editorCanvasRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document
      .querySelector<HTMLElement>('.layout-main')
      ?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  /**
   * Per-resume only. This deliberately no longer writes back to the global
   * `resume-render-settings` store: the editor's Style panel and the Settings
   * page exposed the same controls, and because the editor silently persisted
   * them, tweaking one resume's margins quietly changed the default for every
   * future build. The Settings page is now the only writer of the global
   * default; this drawer is an override, and says so.
   *
   * Per-resume values still persist where they should — a saved history
   * session carries its own `renderSettings` in the snapshot.
   */
  const setRenderSettings = useCallback((next: ResumeRenderSettings) => {
    setRenderSettingsState(mergeResumeRenderSettings(next));
  }, []);

  /** The saved global default, re-read whenever the drawer opens. */
  const [globalRenderDefaults, setGlobalRenderDefaults] = useState(
    loadResumeRenderSettings,
  );

  useEffect(() => {
    if (stylePanelOpen) {
      setGlobalRenderDefaults(loadResumeRenderSettings());
    }
  }, [stylePanelOpen]);

  const styleOverridesActive = useMemo(
    () => JSON.stringify(renderSettings) !== JSON.stringify(globalRenderDefaults),
    [renderSettings, globalRenderDefaults],
  );

  const handleResetStyleToGlobal = useCallback(() => {
    const defaults = loadResumeRenderSettings();
    setGlobalRenderDefaults(defaults);
    setFitModeratorNotice(null);
    setRenderSettingsState(defaults);
  }, []);

  const updateRenderSettings = useCallback(
    (patch: Partial<ResumeRenderSettings>) => {
      setFitModeratorNotice(null);
      setRenderSettings(mergeResumeRenderSettings({ ...renderSettings, ...patch }));
    },
    [renderSettings, setRenderSettings],
  );

  const replaceRenderSettings = useCallback(
    (next: ResumeRenderSettings) => {
      setFitModeratorNotice(null);
      setRenderSettings(next);
    },
    [setRenderSettings],
  );

  /**
   * The letter's typography follows the resume's rather than being tuned
   * separately, so the two documents in one application packet match. The local
   * state exists only so the download-time fit pass can compress a letter that
   * spills; it is re-derived whenever the resume's settings change.
   */
  const derivedCoverLetterSettings = useMemo(
    () => deriveCoverLetterRenderSettings(renderSettings),
    [renderSettings],
  );
  const [coverLetterSettings, setCoverLetterSettings] = useState<CoverLetterRenderSettings>(
    derivedCoverLetterSettings,
  );
  useEffect(() => {
    setCoverLetterSettings(derivedCoverLetterSettings);
  }, [derivedCoverLetterSettings]);

  const applySmallOverflowFit = useCallback(
    (fit: ResumePageFit) => {
      const result = buildSmallOverflowFitSettings(renderSettings, fit, true);
      if (!result.changed) {
        setFitModeratorNotice(result.message);
        return result;
      }
      setRenderSettings(result.settings);
      setFitModeratorNotice(result.message);
      return result;
    },
    [renderSettings, setRenderSettings],
  );

  useEffect(() => {
    if (view !== 'editor' || !pendingEditorScrollRef.current) {
      return;
    }

    pendingEditorScrollRef.current = false;
    requestAnimationFrame(() => {
      scrollEditorToTop();
    });
  }, [scrollEditorToTop, view]);

  useEffect(() => {
    if (view !== 'editor') {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      inspectResumePageFit('resume-export')
        .then((fit) => {
          if (!cancelled) {
            setPageFit(fit);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPageFit(null);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [data, renderSettings, view]);

  useEffect(() => {
    if (view !== 'editor' || !hasCoverLetter) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      inspectResumePageFit('cover-letter-export')
        .then((fit) => {
          if (!cancelled) {
            setCoverLetterFit(fit);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCoverLetterFit(null);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [coverLetter, coverLetterSettings, hasCoverLetter, view]);

  useEffect(() => {
    if (didSeedRef.current) return;
    didSeedRef.current = true;
    fetch('/api/versions')
      .then((r) => r.json())
      .then((versions: unknown[]) => {
        if (versions.length === 0) {
          fetch('/api/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'Original', data, changes: [] }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySnapshot = useCallback(
    (snapshot: HistorySessionSnapshot, sessionId: string, title: string) => {
      setData(snapshot.resume, true);
      setJobDescription(snapshot.jobDescription);
      setLinkedSession(snapshot.linkedSession);
      setShowJdNotes(snapshot.showJdNotes);
      setZoom(snapshot.zoom);
      setAiUserPrompt(snapshot.aiUserPrompt || getDefaultAiUserPrompt());
      setRenderSettings(
        mergeResumeRenderSettings(snapshot.renderSettings),
      );
      setCouncilSnapshot(snapshot.council ?? null);
      if (snapshot.coverLetter) {
        setCoverLetter(snapshot.coverLetter, true);
        setCoverLetterSession(snapshot.coverLetterSession ?? null);
        setHasCoverLetter(true);
      } else {
        setHasCoverLetter(false);
        setCoverLetterSession(null);
      }
      // A restored session is not mid-run, and its request inputs (the source
      // selection) are gone, so regeneration is not offered until a new build.
      coverLetterRequestRef.current = null;
      setCoverLetterRun(IDLE_COVER_LETTER_RUN);
      setDocView('resume');
      setHistorySessionId(sessionId);
      setHistorySessionTitle(title);
      pendingEditorScrollRef.current = true;
      setView('editor');
      try {
        localStorage.setItem(SHOW_JD_NOTES_KEY, String(snapshot.showJdNotes));
      } catch {
        // ignore
      }
    },
    [setCoverLetter, setData, setHasCoverLetter, setRenderSettings],
  );

  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (!sessionId || loadedSessionRef.current === sessionId) {
      return;
    }

    loadedSessionRef.current = sessionId;
    setLoadingSession(true);
    setSessionLoadError(null);

    fetchHistorySession(sessionId)
      .then((session) => {
        applySnapshot(session.snapshot, session.id, session.title);
      })
      .catch((err) => {
        setSessionLoadError(
          err instanceof Error ? err.message : 'Failed to load session',
        );
        loadedSessionRef.current = null;
      })
      .finally(() => setLoadingSession(false));
  }, [searchParams, applySnapshot]);

  const {
    bridgeReady,
    connectedProvider,
    connectProvider,
    sendPdfAndWait,
    sendPromptAndWait,
    sendPromptAsFileAndWait,
    sendImprovementAndWait,
    pipelineEvents,
    pipelineVariant,
    pushPipeline,
    startPipeline,
    debugEvents,
  } = useAiBridge();

  const hasJdNotes = resumeHasJdNotes(data);
  const hasCoverLetterJdNotes = hasCoverLetter && coverLetterHasJdNotes(coverLetter);
  const onCoverLetter = docView === 'cover-letter';
  /** The fit badge, undo, and download all follow whichever document is on screen. */
  const activeFit = onCoverLetter ? coverLetterFit : pageFit;
  const coverLetterBusy =
    coverLetterRun.status === 'sending' ||
    coverLetterRun.status === 'generating' ||
    coverLetterRun.status === 'parsing';

  const handleExpandWithSource = useCallback(
    async (source: RepositorySource) => {
      if (!connectedProvider) {
        setFitModeratorNotice('Connect to an AI provider first (use the AI panel below).');
        return;
      }
      setExpandModalOpen(false);
      setExpanding(true);
      setFitModeratorNotice(null);
      setAiPanelBusy(true);
      try {
        const prompt = buildExpandResumePrompt(data, source, jobDescription);
        // Carries the whole current resume plus the writing standard, so it is
        // large enough to hit Gemini's composer truncation.
        const response = await sendLargePromptAndWait({
          provider: connectedProvider,
          prompt,
          coverPrompt: buildResumeBuildCoverPrompt(EXPAND_TASK_FILENAME),
          filename: EXPAND_TASK_FILENAME,
          senders: { sendPromptAndWait, sendPromptAsFileAndWait },
        });
        const parsed = parseResumeFromLlmResponse(response.rawResponse!, data);
        setData(parsed, true);
        setFitModeratorNotice(`Added "${source.title}" to resume.`);
        window.setTimeout(() => setFitModeratorNotice(null), 3000);
      } catch (err) {
        setFitModeratorNotice(err instanceof Error ? err.message : 'Failed to expand resume.');
      } finally {
        setExpanding(false);
        setAiPanelBusy(false);
      }
    },
    [
      connectedProvider,
      data,
      jobDescription,
      sendPromptAndWait,
      sendPromptAsFileAndWait,
      setData,
    ],
  );

  const toggleJdNotes = useCallback(() => {
    setShowJdNotes((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_JD_NOTES_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [setShowJdNotes]);

  const buildSnapshot = useCallback((): HistorySessionSnapshot => {
    return {
      resume: data,
      jobDescription,
      linkedSession,
      showJdNotes,
      zoom,
      aiUserPrompt,
      renderSettings,
      council: councilSnapshot,
      // Only persisted once a letter actually exists — otherwise every saved
      // session would carry the empty-state template.
      coverLetter: hasCoverLetter ? coverLetter : null,
      coverLetterSession: hasCoverLetter ? coverLetterSession : null,
    };
  }, [
    data,
    jobDescription,
    linkedSession,
    showJdNotes,
    zoom,
    aiUserPrompt,
    renderSettings,
    councilSnapshot,
    coverLetter,
    coverLetterSession,
    hasCoverLetter,
  ]);

  const persistSession = useCallback(
    async (title?: string) => {
      setSavingSession(true);
      setSaveError(null);
      const snapshot = buildSnapshot();

      try {
        if (historySessionId) {
          const updated = await updateHistorySession(
            historySessionId,
            snapshot,
            title,
          );
          setHistorySessionTitle(updated.title);
          setSaveFlash('Session updated');
        } else {
          if (!title?.trim()) {
            throw new Error('Title is required');
          }
          const created = await createHistorySession(title.trim(), snapshot);
          setHistorySessionId(created.id);
          setHistorySessionTitle(created.title);
          setSearchParams({ session: created.id }, { replace: true });
          loadedSessionRef.current = created.id;
          setSaveFlash('Session saved');
        }
        setSaveModalOpen(false);
        window.setTimeout(() => setSaveFlash(null), 2500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save session';
        setSaveError(message);
        throw err;
      } finally {
        setSavingSession(false);
      }
    },
    [buildSnapshot, historySessionId, setSearchParams],
  );

  const handleSaveClick = useCallback(() => {
    if (historySessionId) {
      void persistSession().catch(() => {});
      return;
    }
    setSaveError(null);
    setSaveModalOpen(true);
  }, [historySessionId, persistSession]);

  const handleSaveWithTitle = useCallback(
    (title: string) => {
      void persistSession(title).catch(() => {});
    },
    [persistSession],
  );

  const resumeFilename = `${data.contact.name.replace(/\s+/g, '_') || 'Resume'}_Resume.pdf`;

  const handleDownload = useCallback(async () => {
    setExporting(true);
    try {
      let fit = await inspectResumePageFit('resume-export');
      setPageFit(fit);

      // Safety net: compress near-full and small-overflow resumes until usage
      // drops back under the safe fill line, re-measuring after each pass so the
      // loop converges. This keeps the last line from spilling onto page two.
      let working = renderSettings;
      let passes = 0;
      while (shouldSafetyCompress(fit) && passes < 6) {
        const result = buildSmallOverflowFitSettings(working, fit);
        if (!result.changed) {
          break;
        }
        working = result.settings;
        flushSync(() => {
          setRenderSettings(working);
          setFitModeratorNotice(result.message);
        });
        fit = await inspectResumePageFit('resume-export');
        setPageFit(fit);
        passes += 1;
      }

      if (fit.status === 'over') {
        const overflowInches = fit.overflowPt / 72;
        alert(
          `This resume is over one page by ${overflowInches.toFixed(2)} in even after auto-fit. Trim content or reduce type size before downloading so the PDF stays on one page.`,
        );
        return;
      }
      await exportResumeToPdf('resume-export', resumeFilename);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [renderSettings, resumeFilename, setRenderSettings]);

  const coverLetterFilename = `${
    coverLetter.contact.name.replace(/\s+/g, '_') || 'Cover'
  }_Cover_Letter.pdf`;

  /**
   * Same shape as the resume download: measure, compress if the letter is in
   * the near-full or small-overflow band, re-measure each pass, and refuse to
   * export something that still spills. A cover letter that runs to two pages
   * is a defect, not a preference.
   */
  const handleDownloadCoverLetter = useCallback(async () => {
    setCoverLetterExporting(true);
    try {
      let fit = await inspectResumePageFit('cover-letter-export');
      setCoverLetterFit(fit);

      let working = coverLetterSettings;
      let passes = 0;
      while (fit.usageRatio > 0.98 && fit.usageRatio <= 1.05 && passes < 6) {
        const result = buildCoverLetterSmallOverflowFitSettings(working, fit);
        if (!result.changed) {
          break;
        }
        working = result.settings;
        flushSync(() => {
          setCoverLetterSettings(working);
          setFitModeratorNotice(result.message);
        });
        fit = await inspectResumePageFit('cover-letter-export');
        setCoverLetterFit(fit);
        passes += 1;
      }

      if (fit.status === 'over') {
        const overflowInches = fit.overflowPt / 72;
        alert(
          `This cover letter is over one page by ${overflowInches.toFixed(2)} in even after auto-fit. Shorten a paragraph before downloading.`,
        );
        return;
      }
      await exportResumeToPdf('cover-letter-export', coverLetterFilename);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to export the cover letter PDF.');
    } finally {
      setCoverLetterExporting(false);
    }
  }, [coverLetterFilename, coverLetterSettings]);

  /**
   * Write the cover letter in the background, against the resume that was just
   * applied. This always runs AFTER the resume exists because the resume is one
   * of the letter's inputs — that is what stops the letter from restating it.
   * The editor stays fully usable while it runs; progress shows in the toolbar.
   */
  const startCoverLetterRun = useCallback(
    async (request: CoverLetterRequest, resume: ResumeData) => {
      const runId = coverLetterRunIdRef.current + 1;
      coverLetterRunIdRef.current = runId;
      coverLetterRequestRef.current = request;
      setCoverLetterRun({
        status: 'sending',
        provider: request.provider,
        error: null,
        attachWarning: null,
      });

      try {
        const outcome = await runCoverLetterGeneration({
          provider: request.provider,
          jobDescription: request.jobDescription,
          resume,
          sources: request.sources,
          educationData: request.educationData ?? undefined,
          settingsInstructions: request.settingsInstructions,
          incognito: request.incognito,
          senders: { sendPromptAndWait, sendPromptAsFileAndWait },
          isCancelled: () => coverLetterRunIdRef.current !== runId,
          onStatus: (status) =>
            setCoverLetterRun((prev) =>
              coverLetterRunIdRef.current === runId ? { ...prev, status } : prev,
            ),
          // Never silent: a failed attach on a truncating provider means the
          // model probably saw a decapitated prompt, so the letter may be junk
          // even though the run "succeeded".
          onAttachFailed: (message) =>
            setCoverLetterRun((prev) =>
              coverLetterRunIdRef.current === runId
                ? {
                    ...prev,
                    attachWarning: `${request.provider}: file attach failed, pasted instead (the prompt was likely truncated). ${message}`,
                  }
                : prev,
            ),
        });

        if (coverLetterRunIdRef.current !== runId) {
          return;
        }
        setCoverLetter(outcome.coverLetter, true);
        setCoverLetterSession(outcome.session);
        setHasCoverLetter(true);
        setCoverLetterRun((prev) => ({ ...prev, status: 'done', error: null }));
      } catch (error) {
        if (coverLetterRunIdRef.current !== runId) {
          return;
        }
        setCoverLetterRun((prev) => ({
          ...prev,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Cover letter generation failed.',
        }));
      }
    },
    [sendPromptAndWait, sendPromptAsFileAndWait, setCoverLetter, setHasCoverLetter],
  );

  const handleRegenerateCoverLetter = useCallback(() => {
    const request = coverLetterRequestRef.current;
    if (!request) {
      return;
    }
    void startCoverLetterRun(request, data);
  }, [data, startCoverLetterRun]);

  const handleWizardComplete = useCallback(
    (
      next: ResumeData,
      session: AiChatSession | null,
      nextRenderSettings?: ResumeRenderSettings,
      council?: CouncilSnapshot,
      coverLetterRequest?: CoverLetterRequest,
    ) => {
      if (nextRenderSettings) {
        setRenderSettings(nextRenderSettings);
      }
      setData(next, true);
      setLinkedSession(session);
      setCouncilSnapshot(council ?? null);
      setHistorySessionId(null);
      setHistorySessionTitle(null);
      loadedSessionRef.current = null;
      setSearchParams({}, { replace: true });
      pendingEditorScrollRef.current = true;
      setDocView('resume');
      setView('editor');

      if (coverLetterRequest) {
        // Fire and forget: the resume is on screen immediately and the letter
        // lands when it lands.
        void startCoverLetterRun(coverLetterRequest, next);
      } else {
        coverLetterRequestRef.current = null;
        setCoverLetterRun(IDLE_COVER_LETTER_RUN);
        setHasCoverLetter(false);
        setCoverLetterSession(null);
      }
      try {
        fetch('/api/versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: session?.chatTitle
              ? `Build — ${session.chatTitle}`
              : `Build — ${new Date().toISOString()}`,
            data: next,
            changes: [],
          }),
        }).catch(() => {});
      } catch {
        // non-blocking
      }
    },
    [
      setCoverLetterSession,
      setData,
      setHasCoverLetter,
      setRenderSettings,
      setSearchParams,
      startCoverLetterRun,
    ],
  );

  const handleSkipToEditor = useCallback(() => {
    setHistorySessionId(null);
    setHistorySessionTitle(null);
    setCouncilSnapshot(null);
    loadedSessionRef.current = null;
    setSearchParams({}, { replace: true });
    pendingEditorScrollRef.current = true;
    setView('editor');
  }, [setSearchParams]);

  const handleNewBuild = useCallback(() => {
    setHistorySessionId(null);
    setHistorySessionTitle(null);
    setCouncilSnapshot(null);
    loadedSessionRef.current = null;
    setSearchParams({}, { replace: true });
    setView('wizard');
  }, [setSearchParams]);

  if (loadingSession) {
    return (
      <div className="editor editor--loading">
        <Loader2 size={24} className="spin" />
        <p>Loading session…</p>
      </div>
    );
  }

  if (view === 'wizard') {
    return (
      <div className="editor editor--wizard">
        {sessionLoadError ? (
          <p className="editor-session-error">{sessionLoadError}</p>
        ) : null}
        <ResumeBuilderWizard
          currentResume={data}
          bridgeReady={bridgeReady}
          connectedProvider={connectedProvider}
          connectProvider={connectProvider}
          sendPdfAndWait={sendPdfAndWait}
          sendPromptAndWait={sendPromptAndWait}
          sendPromptAsFileAndWait={sendPromptAsFileAndWait}
          debugEvents={debugEvents}
          sendImprovementAndWait={sendImprovementAndWait}
          pushPipeline={pushPipeline}
          startPipeline={startPipeline}
          pipelineEvents={pipelineEvents}
          pipelineVariant={pipelineVariant}
          onComplete={handleWizardComplete}
          onSkipToEditor={handleSkipToEditor}
          jobDescription={jobDescription}
          onJobDescriptionChange={setJobDescription}
          renderSettings={renderSettings}
        />
      </div>
    );
  }

  return (
    <div className="editor">
      <header className="editor-toolbar">
        <div className="editor-toolbar-left">
          <FileText size={20} className="editor-logo" />
          <div className="editor-title-block">
            <h1 className="editor-title">Resume Builder</h1>
            <p className="editor-subtitle">
              {historySessionTitle ? (
                <>
                  Session: <em>{historySessionTitle}</em>
                  {' · '}
                </>
              ) : null}
              {councilSnapshot ? (
                <>
                  <button
                    type="button"
                    className="editor-council-link"
                    title="View the resumes each candidate produced"
                    onClick={() => setCouncilReviewOpen(true)}
                  >
                    Council build · view candidates
                  </button>
                  {' · '}
                </>
              ) : null}
              Click any text to edit · ⌘Z to undo · Changes auto-save
              {isSaving && ' · Saving…'}
            </p>
          </div>
        </div>

        <div className="editor-toolbar-center">
          {(hasCoverLetter || coverLetterBusy || coverLetterRun.status === 'failed') && (
            <div className="editor-doc-switch" role="group" aria-label="Document">
              <button
                type="button"
                className={`editor-doc-switch-btn${!onCoverLetter ? ' editor-doc-switch-btn--on' : ''}`}
                onClick={() => setDocView('resume')}
              >
                Resume
              </button>
              <button
                type="button"
                className={`editor-doc-switch-btn${onCoverLetter ? ' editor-doc-switch-btn--on' : ''}`}
                onClick={() => setDocView('cover-letter')}
                disabled={!hasCoverLetter}
                title={
                  hasCoverLetter
                    ? 'Show the cover letter'
                    : 'The cover letter is still being written'
                }
              >
                {coverLetterBusy ? <Loader2 size={13} className="spin" /> : null}
                Cover letter
              </button>
            </div>
          )}

          {hasCoverLetter || coverLetterBusy || coverLetterRun.status === 'failed' ? (
            <span className="editor-toolbar-divider" aria-hidden />
          ) : null}

          {coverLetterBusy ? (
            <span
              className="editor-cl-status editor-cl-status--running"
              role="status"
              aria-live="polite"
            >
              {coverLetterRun.status === 'parsing'
                ? 'Reading the cover letter…'
                : coverLetterRun.status === 'generating'
                  ? `${coverLetterRun.provider ?? 'Model'} is writing the cover letter…`
                  : `Sending the cover letter task to ${coverLetterRun.provider ?? 'the model'}…`}
            </span>
          ) : null}

          {coverLetterRun.status === 'failed' && coverLetterRun.error ? (
            <span className="editor-cl-status editor-cl-status--failed" role="status">
              Cover letter failed: {coverLetterRun.error}
              {coverLetterRequestRef.current ? (
                <button
                  type="button"
                  className="toolbar-btn toolbar-btn--secondary"
                  onClick={handleRegenerateCoverLetter}
                >
                  Retry
                </button>
              ) : null}
            </span>
          ) : null}

          {/* Renderer template is a resume-only concept (it decides whether the
              model's <strong> spans show); the letter has no bold emphasis. */}
          <label className="toolbar-template" hidden={onCoverLetter}>
            <span>Format</span>
            <select
              value={renderSettings.defaultTemplate}
              onChange={(event) =>
                updateRenderSettings({
                  defaultTemplate: event.target.value as ResumeRenderSettings['defaultTemplate'],
                })
              }
            >
              {RESUME_RENDER_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="toolbar-zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className={`toolbar-btn toolbar-btn--style${stylePanelOpen ? ' toolbar-btn--toggle-on' : ''}`}
            onClick={() => setStylePanelOpen((open) => !open)}
            title="Style overrides for this resume"
          >
            <SlidersHorizontal size={16} />
            Style
          </button>
        </div>

        <div className="editor-toolbar-right">
          {fitModeratorNotice || saveFlash ? (
            <span className="editor-save-toast" role="status" aria-live="polite">
              {fitModeratorNotice ?? saveFlash}
            </span>
          ) : null}
          <span
            className={`editor-page-fit editor-page-fit--${pageFitVariant(activeFit)}`}
            title={pageFitTitle(activeFit)}
          >
            {pageFitText(activeFit)}
          </span>
          {!onCoverLetter && canModerateSmallOverflow(pageFit) ? (
            <button
              type="button"
              className="toolbar-btn toolbar-btn--fit"
              onClick={() => {
                if (pageFit) {
                  applySmallOverflowFit(pageFit);
                }
              }}
              title="Apply deterministic spacing and size tweaks for small overflow"
            >
              Fit small overflow
            </button>
          ) : null}
          {!onCoverLetter && pageFit?.status === 'under' ? (
            <button
              type="button"
              className="toolbar-btn toolbar-btn--expand"
              onClick={() => setExpandModalOpen(true)}
              disabled={expanding || aiPanelBusy}
              title="Pick a repository item to add to the resume"
            >
              {expanding ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <PlusCircle size={14} />
              )}
              {expanding ? 'Adding…' : 'Add from repo'}
            </button>
          ) : null}

          <span className="editor-toolbar-divider" aria-hidden />

          <button
            type="button"
            className="toolbar-btn toolbar-btn--secondary"
            onClick={handleNewBuild}
            title="Start a new tailored build"
          >
            New build
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn--secondary"
            onClick={handleSaveClick}
            disabled={savingSession}
            title={historySessionId ? 'Update saved session' : 'Save to history'}
          >
            {savingSession ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Save size={16} />
            )}
            Save
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn--secondary"
            onClick={onCoverLetter ? undoCoverLetter : undo}
            disabled={onCoverLetter ? !canUndoCoverLetter : !canUndo}
            title="Undo (⌘Z)"
          >
            <Undo2 size={16} />
            Undo
          </button>
          <span className="editor-toolbar-divider" aria-hidden />

          {!onCoverLetter ? (
            <button
              type="button"
              className="toolbar-btn toolbar-btn--danger"
              onClick={reset}
              title="Discard all edits and reset this resume to the original"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          ) : coverLetterRequestRef.current ? (
            <button
              type="button"
              className="toolbar-btn toolbar-btn--secondary"
              onClick={handleRegenerateCoverLetter}
              disabled={coverLetterBusy}
              title="Write the letter again from the current resume"
            >
              {coverLetterBusy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <RotateCcw size={16} />
              )}
              Regenerate
            </button>
          ) : null}
          <button
            type="button"
            className="toolbar-btn toolbar-btn--primary"
            onClick={onCoverLetter ? handleDownloadCoverLetter : handleDownload}
            disabled={onCoverLetter ? coverLetterExporting : exporting}
          >
            {(onCoverLetter ? coverLetterExporting : exporting) ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            {(onCoverLetter ? coverLetterExporting : exporting)
              ? 'Exporting…'
              : onCoverLetter
                ? 'Download letter'
                : 'Download PDF'}
          </button>
        </div>
      </header>

      {stylePanelOpen ? (
        <>
          <button
            type="button"
            className="editor-style-drawer__scrim"
            aria-label="Close style overrides"
            onClick={() => setStylePanelOpen(false)}
          />
          <aside
            className="editor-style-drawer"
            aria-label="Style overrides for this resume"
          >
            <div className="editor-style-drawer__header">
              <div>
                <h2 className="editor-style-drawer__title">Style</h2>
                <p className="editor-style-drawer__subtitle">
                  Overrides for <strong>this resume</strong> only. Your defaults
                  for new builds live in Settings.
                </p>
              </div>
              <button
                type="button"
                className="editor-style-drawer__close"
                onClick={() => setStylePanelOpen(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="editor-style-drawer__body">
              <ResumeRenderSettingsControls
                settings={renderSettings}
                onChange={replaceRenderSettings}
                tone="dark"
              />
            </div>

            <div className="editor-style-drawer__footer">
              <span className="editor-style-drawer__footer-note">
                {styleOverridesActive
                  ? 'Differs from your saved defaults.'
                  : 'Matching your saved defaults.'}
              </span>
              <button
                type="button"
                className="toolbar-btn toolbar-btn--secondary"
                onClick={handleResetStyleToGlobal}
                disabled={!styleOverridesActive}
                title={
                  styleOverridesActive
                    ? 'Discard these overrides and go back to your Settings defaults'
                    : 'Already matching your Settings defaults'
                }
              >
                <RotateCcw size={14} />
                Reset to global default
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {sessionLoadError ? (
        <p className="editor-session-error">{sessionLoadError}</p>
      ) : null}

      {/* An attach failure means the provider probably received a truncated
          prompt. The run can still "succeed" and produce a bad letter, so this
          is surfaced rather than swallowed. */}
      {coverLetterRun.attachWarning ? (
        <p className="editor-session-error">
          Cover letter: {coverLetterRun.attachWarning}
        </p>
      ) : null}

      {/* Resume-only: every action in this panel (Send PDF, improvements,
          template) operates on the resume, so it would be misleading while the
          letter is on screen. */}
      <AiPanel
        hidden={onCoverLetter}
        resumeFilename={resumeFilename}
        resumeData={data}
        onApplyResume={(next) => {
          setData(next, true);
          requestAnimationFrame(() => scrollEditorToTop());
        }}
        renderSettings={renderSettings}
        onRenderSettingsChange={replaceRenderSettings}
        bridgeReady={bridgeReady}
        connectedProvider={connectedProvider}
        linkedSession={linkedSession}
        onLinkedSessionChange={setLinkedSession}
        jobDescription={jobDescription}
        onJobDescriptionChange={setJobDescription}
        aiUserPrompt={aiUserPrompt}
        onAiUserPromptChange={setAiUserPrompt}
        disabled={aiPanelBusy}
        onBusyChange={setAiPanelBusy}
        connectProvider={connectProvider}
        sendPdfAndWait={sendPdfAndWait}
        sendImprovementAndWait={sendImprovementAndWait}
        pushPipeline={pushPipeline}
        startPipeline={startPipeline}
        debugEvents={debugEvents}
      />

      <PipelineStatus events={pipelineEvents} variant={pipelineVariant} />

      <main className="editor-canvas" ref={editorCanvasRef}>
        {/* Off-screen render used for measurement and PDF export, so neither is
            affected by zoom, editor affordances, or the JD notes panel. */}
        <div className="resume-export-container" aria-hidden="true">
          <ResumeDocument
            data={data}
            onChange={() => {}}
            editing={false}
            id="resume-export"
            settings={renderSettings}
          />
          {hasCoverLetter ? (
            <CoverLetterDocument
              data={coverLetter}
              onChange={() => {}}
              editing={false}
              id="cover-letter-export"
              settings={coverLetterSettings}
            />
          ) : null}
        </div>
        <div
          className={`editor-canvas-stack${
            showJdNotes && (onCoverLetter ? hasCoverLetterJdNotes : hasJdNotes)
              ? ' editor-canvas-stack--with-jd'
              : ''
          }`}
        >
          <FormatToolbar
            variant="canvas"
            trailing={
              (onCoverLetter ? hasCoverLetterJdNotes : hasJdNotes) ? (
                <button
                  type="button"
                  className={`format-toolbar-jd-btn${showJdNotes ? ' format-toolbar-jd-btn--on' : ''}`}
                  onClick={toggleJdNotes}
                >
                  {showJdNotes ? 'Hide JD notes' : 'Show JD notes'}
                </button>
              ) : null
            }
          />
          <div
            className="editor-canvas-inner"
            style={{ transform: `scale(${zoom})` }}
          >
            {onCoverLetter && hasCoverLetter ? (
              <CoverLetterWithJdNotes
                data={coverLetter}
                onChange={setCoverLetter}
                editing
                id="cover-letter-document"
                showJdNotes={showJdNotes}
                settings={coverLetterSettings}
              />
            ) : (
              <ResumeWithJdNotes
                data={data}
                onChange={setData}
                editing
                id="resume-document"
                showJdNotes={showJdNotes}
                settings={renderSettings}
              />
            )}
            <div className="editor-fit-bar" aria-hidden="true">
              <div className="editor-fit-bar-track">
                <div
                  className={`editor-fit-bar-fill editor-fit-bar-fill--${pageFitVariant(activeFit)}`}
                  style={{ height: `${Math.min((activeFit?.usageRatio ?? 0) * 100, 100)}%` }}
                />
              </div>
              <span className="editor-fit-bar-pct">
                {activeFit
                  ? activeFit.usageRatio >= 0.98
                    ? `${(activeFit.usageRatio * 100).toFixed(1)}%`
                    : `${Math.round(activeFit.usageRatio * 100)}%`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="editor-hint">
        <strong>Tip:</strong> Use <em>Save</em> to store this build in History (resume,
        job description, JD notes, zoom, and linked chat). Use <em>New build</em> for a
        fresh tailored run.
      </footer>

      <SaveSessionModal
        open={saveModalOpen}
        saving={savingSession}
        error={saveError}
        onSave={handleSaveWithTitle}
        onClose={() => {
          if (!savingSession) {
            setSaveModalOpen(false);
            setSaveError(null);
          }
        }}
      />
      {councilSnapshot ? (
        <CouncilReviewModal
          open={councilReviewOpen}
          snapshot={councilSnapshot}
          appliedResume={data}
          renderSettings={renderSettings}
          onApply={(next) => {
            setData(next, true);
            requestAnimationFrame(() => scrollEditorToTop());
          }}
          onClose={() => setCouncilReviewOpen(false)}
        />
      ) : null}

      <ExpandResumeModal
        open={expandModalOpen}
        onClose={() => setExpandModalOpen(false)}
        onSelect={handleExpandWithSource}
      />
    </div>
  );
}
