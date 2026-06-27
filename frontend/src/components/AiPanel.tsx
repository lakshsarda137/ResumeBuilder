import { useState, useCallback, useEffect } from 'react';
import { Bot, Check, Clipboard, Link2, Send, Loader2, Plug } from 'lucide-react';
import type { AiChatSession } from '../types/aiSession';
import type { ResumeData } from '../types/resume';
import type { BridgeDebugEvent } from '../hooks/useAiBridge';
import type { ResumeRenderSettings } from '../utils/resumeSettings';
import {
  AI_PROVIDERS,
  getSavedProvider,
  saveProvider,
  type AiProvider,
} from '../utils/aiProviders';
import {
  buildAiPrompt,
  buildImprovementPrompt,
} from '../utils/aiPrompt';
import {
  parseResumeFromLlmResponse,
  summarizeResumeChanges,
} from '../utils/parseResumeResponse';
import { saveAiSession, touchAiSession } from '../utils/aiSessionStorage';
import { blobToBase64, generateResumePdfBlob } from '../utils/pdf';
import type { PipelineVariant } from '../utils/aiPipeline';
import {
  estimateInputTokens,
  formatTokenEstimate,
} from '../utils/tokenEstimate';
import { AiResultModal } from './AiResultModal';
import './AiPanel.css';

interface AiPanelProps {
  resumeFilename: string;
  resumeData: ResumeData;
  onApplyResume: (data: ResumeData) => void;
  renderSettings?: ResumeRenderSettings;
  onRenderSettingsChange?: (settings: ResumeRenderSettings) => void;
  bridgeReady: boolean;
  connectedProvider: AiProvider | null;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  linkedSession?: AiChatSession | null;
  onLinkedSessionChange?: (session: AiChatSession | null) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  aiUserPrompt: string;
  onAiUserPromptChange: (value: string) => void;
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
  debugEvents?: BridgeDebugEvent[];
}

function formatDebugDetail(detail: unknown): string {
  if (detail == null) {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export function AiPanel({
  resumeFilename,
  resumeData,
  onApplyResume,
  renderSettings,
  onRenderSettingsChange,
  bridgeReady,
  connectedProvider,
  disabled = false,
  onBusyChange,
  linkedSession = null,
  onLinkedSessionChange,
  jobDescription,
  onJobDescriptionChange,
  aiUserPrompt,
  onAiUserPromptChange,
  connectProvider,
  sendPdfAndWait,
  sendImprovementAndWait,
  pushPipeline,
  startPipeline,
  debugEvents = [],
}: AiPanelProps) {
  const [provider, setProvider] = useState<AiProvider>(getSavedProvider);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [refining, setRefining] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ResumeData | null>(null);
  const [baselineData, setBaselineData] = useState<ResumeData>(resumeData);
  const [changes, setChanges] = useState<string[]>([]);
  const [refinementChanges, setRefinementChanges] = useState<string[] | null>(
    null,
  );
  const [rawResponse, setRawResponse] = useState('');
  const [activeSession, setActiveSession] = useState<AiChatSession | null>(null);
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false);

  const isBusy = connecting || sending || refining || previewData !== null;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    if (linkedSession) {
      setActiveSession(linkedSession);
    }
  }, [linkedSession]);

  const handleProviderChange = (value: AiProvider) => {
    setProvider(value);
    saveProvider(value);
    setStatus(null);
    setError(null);
  };

  const copyDiagnostics = useCallback(async () => {
    const payload = {
      copied_at: new Date().toISOString(),
      provider,
      connectedProvider,
      error,
      status,
      events: debugEvents,
    };
    const text = JSON.stringify(payload, null, 2);

    const fallbackCopy = () => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
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
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy();
      }
    } else {
      fallbackCopy();
    }

    setDiagnosticsCopied(true);
    window.setTimeout(() => setDiagnosticsCopied(false), 1600);
  }, [connectedProvider, debugEvents, error, provider, status]);

  const sendPromptTokenEstimate = estimateInputTokens(
    buildAiPrompt(aiUserPrompt, resumeData),
  );

  const populatePreview = useCallback(
    (parsed: ResumeData, responseText: string, session: AiChatSession | null) => {
      setPreviewData(parsed);
      setChanges(summarizeResumeChanges(baselineData, parsed));
      setRefinementChanges(null);
      setRawResponse(responseText);
      setActiveSession(session);
      pushPipeline('preview_ready', 'Preview loaded on dashboard');
      setStatus('AI edits captured. Review and apply below.');
    },
    [baselineData, pushPipeline],
  );

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setStatus(null);
    try {
      await connectProvider(provider);
      setStatus(
        bridgeReady
          ? `Connected to ${provider}. Send PDF opens a fresh chat automatically.`
          : `Opened ${provider}. Install the extension for one-click send.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect.');
    } finally {
      setConnecting(false);
    }
  }, [bridgeReady, connectProvider, provider]);

  const handleSendPdf = useCallback(async () => {
    setSending(true);
    setError(null);
    setStatus(null);
    startPipeline('edit_pdf');
    setBaselineData(resumeData);
    pushPipeline('preparing_pdf', 'Preparing resume PDF…');

    try {
      const activeProvider = connectedProvider ?? provider;
      const blob = await generateResumePdfBlob('resume-export', resumeFilename);
      const pdfBase64 = await blobToBase64(blob);
      const fullPrompt = buildAiPrompt(aiUserPrompt, resumeData);

      const response = await sendPdfAndWait({
        provider: activeProvider,
        prompt: fullPrompt,
        pdfBase64,
        filename: resumeFilename,
        forceNewChat: true,
      });

      pushPipeline('parsing_json', 'Parsing resume JSON…');
      const parsed = parseResumeFromLlmResponse(response.rawResponse!, resumeData);

      if (response.session) {
        saveAiSession(response.session);
        onLinkedSessionChange?.(response.session);
      }

      populatePreview(parsed, response.rawResponse!, response.session ?? null);
    } catch (err) {
      pushPipeline('error', err instanceof Error ? err.message : 'Failed');
      setError(err instanceof Error ? err.message : 'Failed to process AI response.');
      setStatus(null);
    } finally {
      setSending(false);
    }
  }, [
    connectedProvider,
    populatePreview,
    provider,
    pushPipeline,
    resumeData,
    resumeFilename,
    sendPdfAndWait,
    startPipeline,
    aiUserPrompt,
  ]);

  const handleRefine = useCallback(
    async (instruction: string) => {
      if (!activeSession || !previewData) {
        return;
      }

      setRefining(true);
      setError(null);
      startPipeline('improvement');
      pushPipeline(
        'returning_to_chat',
        `Returning to chat "${activeSession.chatTitle}"…`,
      );

      try {
        const prompt = buildImprovementPrompt(instruction, previewData);
        const response = await sendImprovementAndWait({
          session: activeSession,
          prompt,
        });

        touchAiSession(activeSession.id);
        pushPipeline('parsing_json', 'Parsing refined resume JSON…');

        const parsed = parseResumeFromLlmResponse(
          response.rawResponse!,
          previewData,
        );

        if (response.session) {
          saveAiSession(response.session);
          setActiveSession(response.session);
          onLinkedSessionChange?.(response.session);
        }

        setRefinementChanges(summarizeResumeChanges(previewData, parsed));
        setPreviewData(parsed);
        setChanges(summarizeResumeChanges(baselineData, parsed));
        setRawResponse(response.rawResponse!);
        pushPipeline('preview_ready', 'Refined preview updated on dashboard');
        setStatus(`Refinement applied from chat "${activeSession.chatTitle}".`);
      } catch (err) {
        pushPipeline('error', err instanceof Error ? err.message : 'Failed');
        setError(
          err instanceof Error ? err.message : 'Failed to process refinement.',
        );
      } finally {
        setRefining(false);
      }
    },
    [
      activeSession,
      baselineData,
      previewData,
      pushPipeline,
      startPipeline,
      sendImprovementAndWait,
    ],
  );

  const handleApply = async () => {
    if (!previewData) {
      return;
    }
    // Save version snapshot before applying
    try {
      const label = activeSession?.chatTitle
        ? `AI edit — ${activeSession.chatTitle}`
        : `AI edit — ${new Date().toLocaleString()}`;
      await fetch('/api/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, data: previewData, changes }),
      });
    } catch {
      // non-blocking — version save failure should not block apply
    }
    onApplyResume(previewData);
    if (activeSession) {
      onLinkedSessionChange?.(activeSession);
    }
    setPreviewData(null);
    setRawResponse('');
    setChanges([]);
    setRefinementChanges(null);
    setActiveSession(null);
    pushPipeline('preview_ready', 'Applied AI edits to your resume');
    setStatus('Applied AI edits to your resume.');
    setError(null);
  };

  const handleDiscard = () => {
    setPreviewData(null);
    setRawResponse('');
    setChanges([]);
    setRefinementChanges(null);
    setActiveSession(null);
    setStatus('Discarded AI edits.');
  };

  return (
    <>
      <section className="ai-panel">
        <div className="ai-panel-controls">
          <div className="ai-panel-title">
            <Bot size={16} />
            <span>Web AI</span>
            <span
              className={`ai-panel-badge ${bridgeReady ? 'ai-panel-badge--ready' : ''}`}
            >
              {bridgeReady ? 'Bridge ready' : 'Extension needed'}
            </span>
          </div>

          <label className="ai-panel-field">
            <span>Provider</span>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
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
            className="ai-panel-btn ai-panel-btn--secondary"
            onClick={handleConnect}
            disabled={connecting || sending || refining || disabled}
          >
            {connecting ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Link2 size={14} />
            )}
            Connect
          </button>

          <button
            type="button"
            className="ai-panel-btn ai-panel-btn--primary"
            onClick={handleSendPdf}
            disabled={sending || connecting || refining || disabled}
          >
            {sending ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Send size={14} />
            )}
            {sending ? 'Working…' : 'Send PDF'}
          </button>
        </div>

        <div className="ai-panel-fields">
          <label className="ai-panel-prompt">
            <span>Job description</span>
            <textarea
              value={jobDescription}
              onChange={(e) => onJobDescriptionChange(e.target.value)}
              rows={2}
              placeholder="Paste or edit the target job description…"
            />
          </label>

          <label className="ai-panel-prompt">
            <span>
              Edit instruction · {formatTokenEstimate(sendPromptTokenEstimate)}
            </span>
            <textarea
              value={aiUserPrompt}
              onChange={(e) => onAiUserPromptChange(e.target.value)}
              rows={2}
              placeholder="e.g. Tighten the Checkmate bullets and add a GitHub link"
            />
          </label>
        </div>

        <div className="ai-panel-meta">
          {!bridgeReady && (
            <p className="ai-panel-install">
              <Plug size={13} />
              Extension stale? Reload extension, then refresh this page (Cmd+R).
            </p>
          )}
          {status && <p className="ai-panel-status">{status}</p>}
          {error && <p className="ai-panel-error">{error}</p>}
        </div>

        {debugEvents.length > 0 ? (
          <details className="ai-panel-debug" open={Boolean(error)}>
            <summary>
              <span>Diagnostics ({debugEvents.length})</span>
              <button
                type="button"
                className="ai-panel-debug-copy"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void copyDiagnostics();
                }}
              >
                {diagnosticsCopied ? <Check size={13} /> : <Clipboard size={13} />}
                {diagnosticsCopied ? 'Copied' : 'Copy all'}
              </button>
            </summary>
            <div className="ai-panel-debug-list">
              {debugEvents.slice(-80).map((entry, index) => (
                <article
                  key={`${entry.at}-${entry.event}-${index}`}
                  className="ai-panel-debug-entry"
                >
                  <div className="ai-panel-debug-meta">
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                    <strong>{entry.event}</strong>
                  </div>
                  {entry.detail != null ? (
                    <pre>{formatDebugDetail(entry.detail)}</pre>
                  ) : null}
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <AiResultModal
        open={previewData !== null}
        baselineData={baselineData}
        changes={changes}
        refinementChanges={refinementChanges}
        previewData={previewData ?? resumeData}
        rawResponse={rawResponse}
        session={activeSession}
        refining={refining}
        renderSettings={renderSettings}
        onRenderSettingsChange={onRenderSettingsChange}
        onApply={handleApply}
        onDiscard={handleDiscard}
        onRefine={handleRefine}
      />
    </>
  );
}
