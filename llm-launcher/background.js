function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId) {
  return new Promise(resolve => {
    const check = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(check);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(check); resolve(); }, 15000);
  });
}

async function pingTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  if (await pingTab(tabId)) return;

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (await pingTab(tabId)) return;
  }

  throw new Error('Content script did not become ready in time.');
}

const PROVIDER_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'LAUNCH') return;

  (async () => {
    const { provider, prompt, pdf, jobId } = message;

    try {
      const tab = await chrome.tabs.create({ url: PROVIDER_URLS[provider], active: false });
      if (!tab.id) throw new Error('Failed to open tab.');

      await waitForTabComplete(tab.id);
      await sleep(3500); // let the page fully render before touching anything

      await ensureContentScript(tab.id);

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'INJECT',
        provider,
        prompt,
        pdf,
      });

      if (!response?.ok) throw new Error(response?.error ?? 'Injection failed.');

      chrome.runtime.sendMessage({
        type: 'llm-launcher-done',
        jobId,
        note: response.note,
        warning: response.warning,
      });
    } catch (err) {
      chrome.runtime.sendMessage({ type: 'llm-launcher-done', jobId, error: err.message });
    }
  })();

  return true;
});
