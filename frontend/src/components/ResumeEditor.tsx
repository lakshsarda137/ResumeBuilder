import { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { HistorySessionSnapshot } from '../types/historySession';
import type { ResumeData } from '../types/resume';
import { ResumeWithJdNotes } from './ResumeWithJdNotes';
import { useResumeState } from '../hooks/useResumeState';
import { useAiBridge } from '../hooks/useAiBridge';
import {
  exportResumeToPdf,
  inspectResumePageFit,
  type ResumePageFit,
} from '../utils/pdf';
import { resumeHasJdNotes } from '../utils/jdNotes';
import { getDefaultAiUserPrompt } from '../utils/aiPrompt';
import {
  buildSmallOverflowFitSettings,
  canModerateSmallOverflow,
} from '../utils/resumeFitModerator';
import {
  RESUME_RENDER_TEMPLATES,
  loadResumeRenderSettings,
  mergeResumeRenderSettings,
  saveResumeRenderSettings,
  type ResumeRenderSettings,
} from '../utils/resumeSettings';
import {
  createHistorySession,
  fetchHistorySession,
  updateHistorySession,
} from '../utils/historySessions';
import { AiPanel } from './AiPanel';
import { FormatToolbar } from './FormatToolbar';
import { PipelineStatus } from './PipelineStatus';
import { ResumeBuilderWizard } from './ResumeBuilderWizard';
import { ResumeDocument } from './ResumeDocument';
import { ResumeRenderSettingsControls } from './ResumeRenderSettingsControls';
import { SaveSessionModal } from './SaveSessionModal';
import './ResumeEditor.css';

const SHOW_JD_NOTES_KEY = 'resume-editor-show-jd-notes';

function pageFitText(fit: ResumePageFit | null) {
  if (!fit) {
    return 'Checking page fit...';
  }
  const percent = Math.round(fit.usageRatio * 100);
  if (fit.status === 'over') {
    return `Over 1 page (${percent}%)`;
  }
  if (fit.status === 'under') {
    return `Under 1 page (${percent}%)`;
  }
  return `Fits 1 page (${percent}%)`;
}

function pageFitTitle(fit: ResumePageFit | null) {
  if (!fit) {
    return 'Measured from the PDF export layout';
  }
  return `Measured from the PDF export layout: ${(fit.usageRatio * 100).toFixed(1)}% used`;
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
  const { data, setData, undo, canUndo, reset, isSaving } = useResumeState();
  const didSeedRef = useRef(false);
  const loadedSessionRef = useRef<string | null>(null);
  const editorCanvasRef = useRef<HTMLElement | null>(null);
  const pendingEditorScrollRef = useRef(false);
  const [view, setView] = useState<'wizard' | 'editor'>('wizard');
  const [linkedSession, setLinkedSession] = useState<AiChatSession | null>(null);
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

  const scrollEditorToTop = useCallback(() => {
    editorCanvasRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document
      .querySelector<HTMLElement>('.layout-main')
      ?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const setRenderSettings = useCallback((next: ResumeRenderSettings) => {
    const merged = mergeResumeRenderSettings(next);
    setRenderSettingsState(merged);
    saveResumeRenderSettings(merged);
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

  const applySmallOverflowFit = useCallback(
    (fit: ResumePageFit) => {
      const result = buildSmallOverflowFitSettings(renderSettings, fit);
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
    [setData, setRenderSettings],
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
    sendImprovementAndWait,
    pipelineEvents,
    pipelineVariant,
    pushPipeline,
    startPipeline,
    debugEvents,
  } = useAiBridge();

  const hasJdNotes = resumeHasJdNotes(data);

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
    };
  }, [
    data,
    jobDescription,
    linkedSession,
    showJdNotes,
    zoom,
    aiUserPrompt,
    renderSettings,
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
      if (canModerateSmallOverflow(fit)) {
        const result = buildSmallOverflowFitSettings(renderSettings, fit);
        if (result.changed) {
          flushSync(() => {
            setRenderSettings(result.settings);
            setFitModeratorNotice(result.message);
          });
          fit = await inspectResumePageFit('resume-export');
          setPageFit(fit);
        }
      }
      if (fit.status === 'over') {
        const overflowInches = fit.overflowPt / 72;
        alert(
          `This resume is over one page by ${overflowInches.toFixed(2)} in. Tighten content or reduce type size before downloading so the PDF is not truncated.`,
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

  const handleWizardComplete = useCallback(
    (
      next: ResumeData,
      session: AiChatSession | null,
      nextRenderSettings?: ResumeRenderSettings,
    ) => {
      if (nextRenderSettings) {
        setRenderSettings(nextRenderSettings);
      }
      setData(next, true);
      setLinkedSession(session);
      setHistorySessionId(null);
      setHistorySessionTitle(null);
      loadedSessionRef.current = null;
      setSearchParams({}, { replace: true });
      pendingEditorScrollRef.current = true;
      setView('editor');
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
    [setData, setRenderSettings, setSearchParams],
  );

  const handleSkipToEditor = useCallback(() => {
    setHistorySessionId(null);
    setHistorySessionTitle(null);
    loadedSessionRef.current = null;
    setSearchParams({}, { replace: true });
    pendingEditorScrollRef.current = true;
    setView('editor');
  }, [setSearchParams]);

  const handleNewBuild = useCallback(() => {
    setHistorySessionId(null);
    setHistorySessionTitle(null);
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
              Click any text to edit · ⌘Z to undo · Changes auto-save
              {isSaving && ' · Saving…'}
            </p>
          </div>
        </div>

        <div className="editor-toolbar-center">
          <label className="toolbar-template">
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
          <span
            className={`editor-page-fit editor-page-fit--${pageFit?.status ?? 'checking'}`}
            title={pageFitTitle(pageFit)}
          >
            {pageFitText(pageFit)}
          </span>
          {canModerateSmallOverflow(pageFit) ? (
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
          <button
            type="button"
            className={`toolbar-btn toolbar-btn--style${stylePanelOpen ? ' toolbar-btn--toggle-on' : ''}`}
            onClick={() => setStylePanelOpen((open) => !open)}
            title="Resume style settings"
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
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
          >
            <Undo2 size={16} />
            Undo
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn--secondary"
            onClick={reset}
            title="Reset to original"
          >
            <RotateCcw size={16} />
            Reset
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn--primary"
            onClick={handleDownload}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            {exporting ? 'Exporting…' : 'Download PDF'}
          </button>
        </div>
      </header>

      {stylePanelOpen ? (
        <section className="editor-style-panel" aria-label="Resume style settings">
          <ResumeRenderSettingsControls
            settings={renderSettings}
            onChange={replaceRenderSettings}
            tone="dark"
            compact
          />
        </section>
      ) : null}

      {sessionLoadError ? (
        <p className="editor-session-error">{sessionLoadError}</p>
      ) : null}

      <AiPanel
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
        <div className="resume-export-container" aria-hidden="true">
          <ResumeDocument
            data={data}
            onChange={() => {}}
            editing={false}
            id="resume-export"
            settings={renderSettings}
          />
        </div>
        <div
          className={`editor-canvas-stack${showJdNotes && hasJdNotes ? ' editor-canvas-stack--with-jd' : ''}`}
        >
          <FormatToolbar
            variant="canvas"
            trailing={
              hasJdNotes ? (
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
            <ResumeWithJdNotes
              data={data}
              onChange={setData}
              editing
              id="resume-document"
              showJdNotes={showJdNotes}
              settings={renderSettings}
            />
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
    </div>
  );
}
