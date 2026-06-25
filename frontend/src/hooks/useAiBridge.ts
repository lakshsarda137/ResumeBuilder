import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiChatSession } from '../types/aiSession';
import type { AiProvider } from '../utils/aiProviders';
import { getProviderConfig } from '../utils/aiProviders';
import {
  createPipelineEvent,
  type PipelineEvent,
  type PipelineVariant,
} from '../utils/aiPipeline';

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

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    return 240_000;
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
  }, []);

  const clearPipeline = useCallback(() => {
    setPipelineEvents([]);
    setPipelineVariant(null);
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
    }: {
      provider: AiProvider;
      prompt: string;
      pdfBase64: string;
      filename: string;
      forceNewChat?: boolean;
    }) => {
      const response = await sendBridgeMessage({
        type: 'SEND_PDF',
        provider,
        prompt,
        pdfBase64,
        filename,
        forceNewChat,
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
    }: {
      provider: AiProvider;
      prompt: string;
    }) => {
      const response = await sendBridgeMessage({
        type: 'SEND_PROMPT',
        provider,
        prompt,
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
    sendImprovementAndWait,
    scrapeUrlAndWait,
    pipelineEvents,
    pipelineVariant,
    pushPipeline,
    startPipeline,
    clearPipeline,
  };
}
