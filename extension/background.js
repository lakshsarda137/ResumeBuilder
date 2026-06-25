const PROVIDERS = {
  claude: {
    openUrl: 'https://claude.ai/new',
    patterns: ['https://claude.ai/*'],
  },
  chatgpt: {
    openUrl: 'https://chatgpt.com/',
    patterns: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  },
  gemini: {
    openUrl: 'https://gemini.google.com/app',
    patterns: ['https://gemini.google.com/*'],
  },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*'] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: 'ANNOUNCE_BRIDGE' }).catch(() => {});
      }
    }
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const check = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(check);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(check);
      resolve();
    }, 15000);
  });
}

async function reportProgress(step, detail) {
  const tabs = await chrome.tabs.query({
    url: ['http://localhost/*', 'http://127.0.0.1/*'],
  });

  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'AI_PROGRESS', step, detail })
        .catch(() => {});
    }
  }
}

async function openNewChat(provider) {
  const config = PROVIDERS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  await reportProgress('opening_chat', `Opening fresh ${provider} chat…`);

  const created = await chrome.tabs.create({
    url: config.openUrl,
    active: false,
  });

  if (created.id == null) {
    throw new Error('Failed to open provider tab.');
  }

  await waitForTabComplete(created.id);
  await sleep(3500);
  await reportProgress('chat_ready', 'Chat session ready');
  return created.id;
}

async function resolveTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new Error(
      'The linked chat tab was closed. Send PDF again to start a new chat.',
    );
  }
}

async function pingLlmTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function injectLlmBridge(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-llm.js'],
  });
}

async function ensureLlmBridge(tabId) {
  if (await pingLlmTab(tabId)) {
    return;
  }

  await injectLlmBridge(tabId);

  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(500);
    if (await pingLlmTab(tabId)) {
      return;
    }
  }

  throw new Error('Chat page is not ready yet. Wait a moment and try again.');
}

async function sendToLlmTab(tabId, message) {
  await ensureLlmBridge(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

function buildSession({ provider, tabId, chatTitle, chatUrl }) {
  const now = Date.now();
  return {
    id: `session-${now}`,
    provider,
    tabId,
    chatTitle: chatTitle || 'Untitled chat',
    chatUrl: chatUrl || '',
    createdAt: now,
    lastUsedAt: now,
  };
}

async function saveSession(session) {
  await chrome.storage.local.set({
    [`session_${session.id}`]: session,
  });
}

async function handleScrapeUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (!parsed.hostname.includes('linkedin.com')) {
    throw new Error('Only LinkedIn profile URLs are supported for now.');
  }

  await reportProgress('opening_chat', 'Opening LinkedIn profile…');

  const created = await chrome.tabs.create({
    url: parsed.href,
    active: false,
  });

  if (created.id == null) {
    throw new Error('Failed to open LinkedIn tab.');
  }

  const linkedInTabId = created.id;

  await waitForTabComplete(linkedInTabId);
  await sleep(2500);

  await chrome.scripting.executeScript({
    target: { tabId: linkedInTabId },
    files: ['content-scrape.js'],
  });

  const response = await chrome.tabs.sendMessage(linkedInTabId, { type: 'SCRAPE_PAGE' });

  await chrome.tabs.remove(linkedInTabId).catch(() => {});

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to read LinkedIn profile.');
  }

  await reportProgress('chat_ready', 'LinkedIn profile captured');

  return {
    ok: true,
    text: response.text,
    url: response.url ?? parsed.href,
    title: response.title ?? 'LinkedIn profile',
  };
}

async function handleConnect(provider) {
  await openNewChat(provider);
  return { ok: true };
}

async function handleSendPrompt({ provider, prompt }) {
  const tabId = await openNewChat(provider);
  await sleep(800);

  const response = await sendToLlmTab(
    tabId,
    {
      type: 'INJECT_PDF',
      provider,
      prompt,
      skipAttach: true,
    },
  );

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Provider page did not accept the prompt.');
  }

  const session = buildSession({
    provider,
    tabId,
    chatTitle: response.chatTitle,
    chatUrl: response.chatUrl,
  });
  await saveSession(session);

  return {
    ok: true,
    rawResponse: response.rawResponse ?? '',
    session,
  };
}

async function handleSendPdf(
  { provider, prompt, pdfBase64, filename, forceNewChat },
) {
  const tabId = forceNewChat
    ? await openNewChat(provider)
    : await openNewChat(provider);

  await sleep(800);

  const response = await sendToLlmTab(
    tabId,
    {
      type: 'INJECT_PDF',
      provider,
      prompt,
      pdfBase64,
      filename,
      skipAttach: false,
    },
  );

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Provider page did not accept the PDF.');
  }

  const session = buildSession({
    provider,
    tabId,
    chatTitle: response.chatTitle,
    chatUrl: response.chatUrl,
  });
  await saveSession(session);

  return {
    ok: true,
    rawResponse: response.rawResponse ?? '',
    session,
  };
}

async function handleSendImprovement({
  sessionId,
  provider,
  tabId,
  chatTitle,
  prompt,
}) {
  await resolveTab(tabId);
  await reportProgress(
    'returning_to_chat',
    `Returning to chat "${chatTitle || 'linked chat'}"…`,
  );

  const response = await sendToLlmTab(
    tabId,
    {
      type: 'INJECT_PDF',
      provider,
      prompt,
      skipAttach: true,
    },
  );

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to send improvement prompt.');
  }

  const session = {
    ...buildSession({
      provider,
      tabId,
      chatTitle: response.chatTitle || chatTitle,
      chatUrl: response.chatUrl,
    }),
    id: sessionId,
    lastUsedAt: Date.now(),
  };
  await saveSession(session);

  return {
    ok: true,
    rawResponse: response.rawResponse ?? '',
    session,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'AI_PROGRESS') {
        await reportProgress(message.step, message.detail);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'ANNOUNCE_BRIDGE') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'CONNECT') {
        sendResponse(await handleConnect(message.provider));
        return;
      }

      if (message.type === 'SEND_PDF') {
        sendResponse(await handleSendPdf(message));
        return;
      }

      if (message.type === 'SEND_PROMPT') {
        sendResponse(await handleSendPrompt(message));
        return;
      }

      if (message.type === 'SEND_IMPROVEMENT') {
        sendResponse(await handleSendImprovement(message));
        return;
      }

      if (message.type === 'SCRAPE_URL') {
        sendResponse(await handleScrapeUrl(message.url));
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type.' });
    } catch (error) {
      await reportProgress('error', error instanceof Error ? error.message : 'Bridge failed.');
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Bridge failed.',
      });
    }
  })();

  return true;
});
