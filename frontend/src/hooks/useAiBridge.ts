import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatSession } from '../types/aiSession';
import type { AiProvider } from '../utils/aiProviders';
import { getProviderConfig } from '../utils/aiProviders';
import {
  createPipelineEvent,
  type PipelineEvent,
  type PipelineVariant,
} from '../utils/aiPipeline';
import { blobToBase64 } from '../utils/pdf';

const APP_SOURCE = 'resume-builder-app';
const BRIDGE_SOURCE = 'resume-builder-bridge';

export type BridgeResponse = {
  ok: boolean;
  error?: string;
  rawResponse?: string;
  session?: AiChatSession;
  text?: string;
  url?: string;
  title?: string;
};

export type BridgeDebugEvent = {
  at: string;
  event: string;
  detail?: unknown;
  requestId?: string | null;
};

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function extractPdfMarkdown({
  pdfBase64,
  filename,
}: {
  pdfBase64: string;
  filename: string;
}) {
  const res = await fetch('/api/pdf/markdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64: pdfBase64, filename }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    markdown?: string;
    engine?: string;
    error?: string;
  };

  if (!res.ok || !body.markdown?.trim()) {
    throw new Error(body.error ?? 'Failed to extract PDF text for Gemini.');
  }

  return {
    markdown: body.markdown,
    engine: body.engine ?? 'local PDF markdown extractor',
  };
}

function buildGeminiMarkdownPdfPrompt({
  prompt,
  filename,
  markdown,
  engine,
}: {
  prompt: string;
  filename: string;
  markdown: string;
  engine: string;
}) {
  const trimmedMarkdown = markdown.trim();
  const maxMarkdownChars = 80_000;
  const wasTruncated = trimmedMarkdown.length > maxMarkdownChars;
  const markdownForPrompt = wasTruncated
    ? trimmedMarkdown.slice(0, maxMarkdownChars)
    : trimmedMarkdown;

  return `${prompt}

GEMINI-SPECIFIC INPUT NOTE:
The original PDF could not be attached through Gemini's hidden-tab web upload UI, so Resume Builder extracted the PDF locally and pasted the markdown/text below instead.
Where the instructions above say "attached PDF", use this extracted markdown as the source PDF content. Preserve the original PDF facts faithfully; do not invent content that is missing from the extracted text.

SOURCE PDF: ${filename}
LOCAL EXTRACTION ENGINE: ${engine}
${wasTruncated ? 'NOTE: The extracted markdown was truncated to fit the prompt budget. Use only the visible extracted content below.' : ''}

EXTRACTED PDF MARKDOWN:
\`\`\`markdown
${markdownForPrompt}
\`\`\``;
}

// Write an attachment to a temp file on the local backend and return its
// ABSOLUTE path, which the extension feeds to CDP DOM.setFileInputFiles (it
// reads from disk by path). Used for the Gemini judge file attach.
async function writeGeminiTempFile({
  base64,
  text,
  filename,
}: {
  base64?: string;
  text?: string;
  filename: string;
}): Promise<string> {
  const res = await fetch('/api/tmpfile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      base64 != null ? { base64, filename } : { text: text ?? '', filename },
    ),
  });
  const body = (await res.json().catch(() => ({}))) as {
    path?: string;
    error?: string;
  };
  if (!res.ok || !body.path) {
    throw new Error(body.error ?? 'Failed to prepare the file for Gemini.');
  }
  return body.path;
}

function isBridgeMarkedReady() {
  return document.documentElement.getAttribute('data-resume-bridge') === 'ready';
}

function pingBridge() {
  window.postMessage({ source: APP_SOURCE, type: 'PING_BRIDGE' }, '*');
}

function getTimeoutForPayload(payload: Record<string, unknown>) {
  if (
    payload.type === 'SEND_PDF' ||
    payload.type === 'SEND_PROMPT' ||
    payload.type === 'SEND_IMPROVEMENT'
  ) {
    return 600_000;
  }
  if (payload.type === 'SCRAPE_URL') {
    return 60_000;
  }
  return 45_000;
}

export function useAiBridge() {
  const [bridgeReady, setBridgeReady] = useState(isBridgeMarkedReady);
  const [connectedProvider, setConnectedProvider] = useState<AiProvider | null>(
    null,
  );
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const [pipelineVariant, setPipelineVariant] = useState<PipelineVariant | null>(
    null,
  );
  const [debugEvents, setDebugEvents] = useState<BridgeDebugEvent[]>([]);
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (value: BridgeResponse) => void;
        reject: (error: Error) => void;
      }
    >(),
  );

  const pushPipeline = useCallback((step: string, detail?: string) => {
    setPipelineEvents((events) => {
      const last = events[events.length - 1];
      if (last?.step === step && step === 'waiting') {
        return [...events.slice(0, -1), createPipelineEvent(step, detail)];
      }
      return [...events, createPipelineEvent(step, detail)];
    });
  }, []);

  const startPipeline = useCallback((variant: PipelineVariant) => {
    setPipelineVariant(variant);
    setPipelineEvents([]);
    setDebugEvents([]);
  }, []);

  const clearPipeline = useCallback(() => {
    setPipelineEvents([]);
    setPipelineVariant(null);
  }, []);

  const clearDebugEvents = useCallback(() => {
    setDebugEvents([]);
  }, []);

  useEffect(() => {
    const markReady = () => setBridgeReady(true);

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (!data || data.source !== BRIDGE_SOURCE) {
        return;
      }

      if (data.type === 'READY') {
        markReady();
        return;
      }

      if (data.type === 'INVALIDATED') {
        setBridgeReady(false);
        document.documentElement.removeAttribute('data-resume-bridge');
        return;
      }

      if (data.type === 'PROGRESS') {
        pushPipeline(data.step, data.detail);
        return;
      }

      if (data.type === 'DEBUG') {
        setDebugEvents((events) => {
          const entry = data.entry as BridgeDebugEvent;
          const last = events[events.length - 1];
          if (
            last &&
            last.at === entry.at &&
            last.event === entry.event &&
            JSON.stringify(last.detail ?? null) === JSON.stringify(entry.detail ?? null)
          ) {
            return events;
          }
          return [...events, entry].slice(-120);
        });
        return;
      }

      if (data.requestId && pendingRef.current.has(data.requestId)) {
        const pending = pendingRef.current.get(data.requestId)!;
        pendingRef.current.delete(data.requestId);
        pending.resolve(data.response as BridgeResponse);
      }
    };

    if (isBridgeMarkedReady()) {
      markReady();
    }

    window.addEventListener('message', handleMessage);

    pingBridge();
    const interval = window.setInterval(() => {
      if (isBridgeMarkedReady()) {
        markReady();
        window.clearInterval(interval);
        return;
      }
      pingBridge();
    }, 1000);

    const stopPolling = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 12000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopPolling);
      window.removeEventListener('message', handleMessage);
    };
  }, [pushPipeline]);

  const sendBridgeMessage = useCallback(
    (payload: Record<string, unknown>) =>
      new Promise<BridgeResponse>((resolve, reject) => {
        if (!bridgeReady && !isBridgeMarkedReady()) {
          reject(
            new Error(
              'Extension bridge is stale. Reload the extension, then refresh this page (Cmd+R).',
            ),
          );
          return;
        }

        const requestId = createRequestId();
        const timeoutMs = getTimeoutForPayload(payload);
        const timeout = window.setTimeout(() => {
          if (pendingRef.current.has(requestId)) {
            pendingRef.current.delete(requestId);
            reject(
              new Error(
                'Timed out waiting for the LLM response. Check the chat tab and try again.',
              ),
            );
          }
        }, timeoutMs);

        pendingRef.current.set(requestId, {
          resolve: (response) => {
            window.clearTimeout(timeout);
            resolve(response);
          },
          reject: (error) => {
            window.clearTimeout(timeout);
            reject(error);
          },
        });

        window.postMessage(
          {
            source: APP_SOURCE,
            requestId,
            payload,
          },
          '*',
        );
      }),
    [bridgeReady],
  );

  const connectProvider = useCallback(
    async (provider: AiProvider) => {
      const config = getProviderConfig(provider);

      if (bridgeReady || isBridgeMarkedReady()) {
        const response = await sendBridgeMessage({
          type: 'CONNECT',
          provider,
        });
        if (!response.ok) {
          throw new Error(response.error ?? 'Failed to open provider tab.');
        }
      } else {
        window.open(config.openUrl, '_blank', 'noopener,noreferrer');
      }

      setConnectedProvider(provider);
    },
    [bridgeReady, sendBridgeMessage],
  );

  const sendPdfAndWait = useCallback(
    async ({
      provider,
      prompt,
      pdfBase64,
      filename,
      forceNewChat = true,
      incognito = false,
    }: {
      provider: AiProvider;
      prompt: string;
      pdfBase64: string;
      filename: string;
      forceNewChat?: boolean;
      incognito?: boolean;
    }) => {
      if (provider === 'gemini') {
        pushPipeline('reading_pdf', `Extracting ${filename} locally for Gemini…`);
        const extracted = await extractPdfMarkdown({ pdfBase64, filename });
        const geminiPrompt = buildGeminiMarkdownPdfPrompt({
          prompt,
          filename,
          markdown: extracted.markdown,
          engine: extracted.engine,
        });
        pushPipeline('importing_pdf', 'Sending extracted PDF text to Gemini…');
        const response = await sendBridgeMessage({
          type: 'SEND_PROMPT',
          provider,
          prompt: geminiPrompt,
          forceNewChat,
          incognito,
        });

        if (!response.ok) {
          throw new Error(response.error ?? 'Failed to send extracted PDF text to Gemini.');
        }

        if (!response.rawResponse?.trim()) {
          throw new Error(
            'No response captured from Gemini. Wait for the reply in the provider tab, then try again.',
          );
        }

        return response;
      }

      const response = await sendBridgeMessage({
        type: 'SEND_PDF',
        provider,
        prompt,
        pdfBase64,
        filename,
        forceNewChat,
        incognito,
      });

      if (!response.ok) {
        throw new Error(response.error ?? 'Failed to send PDF to provider.');
      }

      if (!response.rawResponse?.trim()) {
        throw new Error(
          'No response captured from the chat. Wait for the reply in the provider tab, then try again.',
        );
      }

      return response;
    },
    [pushPipeline, sendBridgeMessage],
  );

  /**
   * Deliver a large text prompt as a plain-text (.txt) file attachment plus a
   * short cover instruction, instead of typing the whole thing into the
   * composer. Used for the LLM Council judge on Gemini, whose composer silently
   * truncates very large pasted prompts. Reuses the extension's SEND_PDF attach
   * path (MIME is inferred from the .txt filename), bypassing the Gemini
   * extract-to-text branch in sendPdfAndWait.
   */
  const sendPromptAsFileAndWait = useCallback(
    async ({
      provider,
      coverPrompt,
      fileText,
      filename,
      forceNewChat = true,
      incognito = false,
    }: {
      provider: AiProvider;
      coverPrompt: string;
      fileText: string;
      filename: string;
      forceNewChat?: boolean;
      incognito?: boolean;
    }) => {
      let payload: Record<string, unknown>;
      if (provider === 'gemini') {
        // Gemini's web upload UI can't be fed by synthetic events, so the
        // extension does a real CDP file-chooser attach that reads the file
        // from disk by absolute path. Write the file locally and pass the path.
        // (This briefly foregrounds the Gemini tab — scoped to this judge/file
        // path, per the agreed constraint.)
        //
        // Do NOT "improve" this by routing Gemini through the content-script
        // attach: next_steps.md records that synthetic-event attach was tested
        // and fails on Gemini in both background AND foreground tabs, because
        // the "+" menu exposes no reachable <input type=file> and "Upload
        // files" opens the native OS picker. CDP interception is the only path
        // that works.
        const geminiFilePath = await writeGeminiTempFile({ text: fileText, filename });
        payload = {
          type: 'SEND_PDF',
          provider,
          prompt: coverPrompt,
          geminiFilePath,
          filename,
          forceNewChat,
          incognito,
        };
      } else {
        const base64 = await blobToBase64(
          new Blob([fileText], { type: 'text/plain' }),
        );
        payload = {
          type: 'SEND_PDF',
          provider,
          prompt: coverPrompt,
          pdfBase64: base64,
          filename,
          forceNewChat,
          incognito,
        };
      }

      const response = await sendBridgeMessage(payload);

      if (!response.ok) {
        throw new Error(
          response.error ?? 'Failed to attach the prompt file to the provider.',
        );
      }

      if (!response.rawResponse?.trim()) {
        throw new Error(
          'No response captured from the chat. Wait for the reply in the provider tab, then try again.',
        );
      }

      return response;
    },
    [sendBridgeMessage],
  );

  const sendImprovementAndWait = useCallback(
    async ({
      session,
      prompt,
    }: {
      session: AiChatSession;
      prompt: string;
    }) => {
      const response = await sendBridgeMessage({
        type: 'SEND_IMPROVEMENT',
        sessionId: session.id,
        tabId: session.tabId,
        provider: session.provider,
        chatTitle: session.chatTitle,
        prompt,
      });

      if (!response.ok) {
        throw new Error(response.error ?? 'Failed to send improvement prompt.');
      }

      if (!response.rawResponse?.trim()) {
        throw new Error('No improvement response captured from the chat.');
      }

      return response;
    },
    [sendBridgeMessage],
  );

  const sendPromptAndWait = useCallback(
    async ({
      provider,
      prompt,
      incognito = false,
    }: {
      provider: AiProvider;
      prompt: string;
      incognito?: boolean;
    }) => {
      const response = await sendBridgeMessage({
        type: 'SEND_PROMPT',
        provider,
        prompt,
        incognito,
      });

      if (!response.ok) {
        throw new Error(response.error ?? 'Failed to send prompt to provider.');
      }

      if (!response.rawResponse?.trim()) {
        throw new Error(
          'No response captured from the chat. Wait for the reply in the provider tab, then try again.',
        );
      }

      return response;
    },
    [sendBridgeMessage],
  );

  const scrapeUrlAndWait = useCallback(
    async (url: string) => {
      const response = await sendBridgeMessage({
        type: 'SCRAPE_URL',
        url,
      });

      if (!response.ok) {
        throw new Error(response.error ?? 'Failed to read profile URL.');
      }

      if (!response.text?.trim()) {
        throw new Error('No profile text captured from URL.');
      }

      return {
        text: response.text as string,
        url: (response.url as string | undefined) ?? url,
        title: (response.title as string | undefined) ?? 'Profile',
      };
    },
    [sendBridgeMessage],
  );

  return {
    bridgeReady,
    connectedProvider,
    connectProvider,
    sendPdfAndWait,
    sendPromptAndWait,
    sendPromptAsFileAndWait,
    sendImprovementAndWait,
    scrapeUrlAndWait,
    pipelineEvents,
    pipelineVariant,
    debugEvents,
    pushPipeline,
    startPipeline,
    clearPipeline,
    clearDebugEvents,
  };
}
