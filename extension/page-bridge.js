(function () {
  const APP_SOURCE = 'resume-builder-app';
  const BRIDGE_SOURCE = 'resume-builder-bridge';

  function announceReady() {
    window.postMessage({ source: BRIDGE_SOURCE, type: 'READY' }, '*');
    document.documentElement.setAttribute('data-resume-bridge', 'ready');
  }

  announceReady();

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (data?.source === APP_SOURCE && data?.type === 'PING_BRIDGE') {
      announceReady();
    }
  });

  document.addEventListener('resume-bridge-response', (event) => {
    const detail = event.detail;
    if (!detail?.requestId) {
      return;
    }

    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        requestId: detail.requestId,
        response: detail.response,
      },
      '*',
    );
  });

  document.addEventListener('resume-bridge-ping', announceReady);

  document.addEventListener('resume-bridge-invalidated', () => {
    document.documentElement.removeAttribute('data-resume-bridge');
    window.postMessage({ source: BRIDGE_SOURCE, type: 'INVALIDATED' }, '*');
  });

  document.addEventListener('resume-bridge-progress', (event) => {
    const detail = event.detail;
    if (!detail?.step) {
      return;
    }
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type: 'PROGRESS',
        step: detail.step,
        detail: detail.detail,
      },
      '*',
    );
  });
})();
