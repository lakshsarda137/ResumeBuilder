const APP_SOURCE = 'resume-builder-app';

function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function invalidateBridge(requestId, errorMessage) {
  document.documentElement.dataset.resumeBridgeInjected = 'false';
  document.documentElement.removeAttribute('data-resume-bridge');
  document.dispatchEvent(new CustomEvent('resume-bridge-invalidated'));

  if (requestId) {
    document.dispatchEvent(
      new CustomEvent('resume-bridge-response', {
        detail: {
          requestId,
          response: { ok: false, error: errorMessage },
        },
      }),
    );
  }
}

function injectPageBridge() {
  if (!isExtensionContextValid()) {
    invalidateBridge(
      null,
      'Extension was reloaded. Refresh this page (Cmd+R), then try again.',
    );
    return;
  }

  if (document.documentElement.dataset.resumeBridgeInjected === 'true') {
    document.dispatchEvent(new CustomEvent('resume-bridge-ping'));
    return;
  }

  document.documentElement.dataset.resumeBridgeInjected = 'true';

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-bridge.js');
  script.addEventListener('load', () => script.remove());
  script.addEventListener('error', () => {
    document.documentElement.dataset.resumeBridgeInjected = 'false';
    console.error('[Resume Builder Bridge] Failed to load page-bridge.js');
  });
  (document.head || document.documentElement).appendChild(script);
}

function relayProgress(step, detail) {
  window.postMessage(
    {
      source: 'resume-builder-bridge',
      type: 'PROGRESS',
      step,
      detail,
    },
    '*',
  );

  document.dispatchEvent(
    new CustomEvent('resume-bridge-progress', {
      detail: { step, detail },
    }),
  );
}

function forwardToBackground(requestId, payload) {
  if (!isExtensionContextValid()) {
    invalidateBridge(
      requestId,
      'Extension was reloaded. Refresh this page (Cmd+R), then try again.',
    );
    return;
  }

  try {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError?.message;

      if (error?.includes('Extension context invalidated')) {
        invalidateBridge(
          requestId,
          'Extension was reloaded. Refresh this page (Cmd+R), then try again.',
        );
        return;
      }

      document.dispatchEvent(
        new CustomEvent('resume-bridge-response', {
          detail: {
            requestId,
            response: error
              ? { ok: false, error }
              : response ?? { ok: false, error: 'No response from extension.' },
          },
        }),
      );
    });
  } catch (error) {
    invalidateBridge(
      requestId,
      error instanceof Error
        ? error.message
        : 'Extension bridge crashed. Refresh this page (Cmd+R).',
    );
  }
}

if (isExtensionContextValid()) {
  injectPageBridge();
} else {
  invalidateBridge(null, 'Extension was reloaded. Refresh this page (Cmd+R).');
}

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== APP_SOURCE) {
    return;
  }

  if (data.type === 'PING_BRIDGE') {
    if (isExtensionContextValid()) {
      injectPageBridge();
    } else {
      invalidateBridge(
        null,
        'Extension was reloaded. Refresh this page (Cmd+R), then try again.',
      );
    }
    return;
  }

  if (!data.requestId || !data.payload) {
    return;
  }

  forwardToBackground(data.requestId, data.payload);
});

if (isExtensionContextValid()) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'ANNOUNCE_BRIDGE') {
      injectPageBridge();
      return;
    }

    if (message?.type === 'AI_PROGRESS') {
      relayProgress(message.step, message.detail);
    }
  });
}
