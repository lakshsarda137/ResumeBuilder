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

chrome.runtime.onStartup?.addListener(() => {
  reportDebug('background_started', { backupPoller: true }).catch(() => {});
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const completedCaptureRequests = new Set();

function requestKey(appTabId, requestId) {
  return `${appTabId ?? 'no-tab'}:${requestId ?? 'no-request'}`;
}

async function reportDebug(event, detail = {}, appTabId = null, requestId = null) {
  const entry = {
    at: new Date().toISOString(),
    event,
    detail,
    requestId,
  };

  const tabs =
    appTabId != null
      ? [{ id: appTabId }]
      : await chrome.tabs.query({
          url: ['http://localhost/*', 'http://127.0.0.1/*'],
        });

  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'AI_DEBUG', entry })
        .catch(() => {});
    }
  }
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

async function relayResponseToApp(appTabId, requestId, response) {
  if (appTabId == null || !requestId) {
    return;
  }

  completedCaptureRequests.add(requestKey(appTabId, requestId));
  await reportDebug(
    'relay_response_to_app',
    {
      ok: response?.ok === true,
      rawLength: response?.rawResponse?.length ?? 0,
      error: response?.error ?? null,
    },
    appTabId,
    requestId,
  );

  await chrome.tabs
    .sendMessage(appTabId, {
      type: 'AI_RESPONSE',
      requestId,
      response,
    })
    .catch(() => {});
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

async function startLlmCapture(tabId, message) {
  await ensureLlmBridge(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    ...message,
    asyncCapture: true,
  });

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Provider page did not accept the request.');
  }

  await reportDebug(
    'content_capture_started',
    {
      provider: message.provider,
      tabId,
      asyncAccepted: response.async === true,
      skipAttach: message.skipAttach === true,
      hasPdf: Boolean(message.pdfBase64),
      promptLength: message.prompt?.length ?? 0,
    },
    message.appTabId,
    message.appRequestId,
  );

  if (message.appRequestId && message.appTabId != null) {
    startBackupCapturePoll(tabId, message).catch((error) => {
      reportDebug(
        'backup_poll_crashed',
        { error: error instanceof Error ? error.message : String(error) },
        message.appTabId,
        message.appRequestId,
      );
    });
  }

  return response;
}

function looksLikeDetectionError(error) {
  return /timed out waiting|not detected|incomplete|no response captured/i.test(
    error ?? '',
  );
}

function extractDelimitedPayloadFromPage(promptText = '') {
  function repairJson(json) {
    return json
      .replace(/^\uFEFF/, '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
  }

  function normalizeComparableText(value) {
    return typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\s+/g, ' ')
      : '';
  }

  function isPlaceholderCaptureText(value) {
    const text = normalizeComparableText(value);
    if (!text) {
      return true;
    }

    return (
      text === 'string' ||
      text === 'title' ||
      text === 'category' ||
      text === 'section' ||
      text === 'bullet' ||
      text === 'bullet text' ||
      text === 'optional string' ||
      text.startsWith('optional ') ||
      /^bullet \d+$/.test(text) ||
      /^entry \d+$/.test(text)
    );
  }

  function hasRealCaptureText(value) {
    return (
      typeof value === 'string' &&
      value.trim().length > 1 &&
      !isPlaceholderCaptureText(value)
    );
  }

  function candidateAppearsInSubmittedPrompt(candidate) {
    if (!candidate || !promptText || candidate.length < 30) {
      return false;
    }

    const normalizedCandidate = candidate.replace(/\s+/g, ' ').trim();
    const normalizedPrompt = promptText.replace(/\s+/g, ' ').trim();
    if (
      normalizedCandidate &&
        normalizedPrompt &&
        normalizedPrompt.includes(normalizedCandidate)
    ) {
      return true;
    }

    let canonicalCandidate = '';
    try {
      canonicalCandidate = JSON.stringify(JSON.parse(repairJson(candidate)));
    } catch {
      return false;
    }

    const promptCandidates = [
      ...promptText.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g),
      ...promptText.matchAll(/```json\s*([\s\S]*?)```/gi),
      ...promptText.matchAll(/```\s*([\s\S]*?)```/g),
    ];

    return promptCandidates.some((match) => {
      try {
        return (
          JSON.stringify(JSON.parse(repairJson(match[1]?.trim() ?? ''))) ===
          canonicalCandidate
        );
      } catch {
        return false;
      }
    });
  }

  function isRealImportPayload(parsed) {
    if (!parsed || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      return false;
    }

    return parsed.entries.some((entry) => {
      const type = typeof entry.type === 'string' ? entry.type.trim() : '';
      const title =
        typeof entry.title === 'string' ? entry.title.trim().toLowerCase() : '';
      const freewrite =
        typeof entry.freewrite === 'string' ? entry.freewrite.trim() : '';

      return (
        (type === 'experience' || type === 'project') &&
        title !== 'role or project name' &&
        freewrite.length > 15 &&
        !/raw narrative freewrite/i.test(freewrite)
      );
    });
  }

  function isRealResumePayload(parsed) {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
      return false;
    }

    return parsed.sections.some((section) => {
      const type = typeof section.type === 'string' ? section.type.trim() : '';
      const sectionLooksReal =
        hasRealCaptureText(section.title) &&
        type &&
        type !== 'education | experience | projects | skills | custom';

      const entries = Array.isArray(section.entries) ? section.entries : [];
      if (
        entries.some((entry) => {
          const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
          const hasEntryIdentity =
            hasRealCaptureText(entry.title) ||
            hasRealCaptureText(entry.subtitle) ||
            hasRealCaptureText(entry.location) ||
            hasRealCaptureText(entry.date);
          const hasEntryContent =
            hasRealCaptureText(entry.subtitle) ||
            hasRealCaptureText(entry.location) ||
            hasRealCaptureText(entry.date) ||
            bullets.some((bullet) => {
              const text =
                typeof bullet === 'string'
                  ? bullet
                  : typeof bullet?.text === 'string'
                    ? bullet.text
                    : '';
              return hasRealCaptureText(text);
            });

          return sectionLooksReal && hasEntryIdentity && hasEntryContent;
        })
      ) {
        return true;
      }

      const skills = Array.isArray(section.skills) ? section.skills : [];
      return skills.some((skill) => {
        const label =
          typeof skill.label === 'string' ? skill.label.trim().toLowerCase() : '';
        const items =
          typeof skill.items === 'string' ? skill.items.trim().toLowerCase() : '';
        return (
          sectionLooksReal &&
          ((label && label !== 'string' && label !== 'category') ||
            (items && items !== 'string'))
        );
      });
    });
  }

  function expectsResumeWrapper() {
    return (
      /"baseline"\s*:/.test(promptText) &&
      /"optimized"\s*:/.test(promptText) &&
      /before\/after diff|attached resume PDF|baseline resume JSON/i.test(promptText)
    );
  }

  function isResumeWrapperPayload(parsed) {
    return (
      parsed &&
      typeof parsed === 'object' &&
      isRealResumePayload(parsed.baseline) &&
      isRealResumePayload(parsed.optimized)
    );
  }

  function isCapturedPayload(parsed) {
    if (expectsResumeWrapper()) {
      return isResumeWrapperPayload(parsed);
    }

    if (isRealImportPayload(parsed) || isRealResumePayload(parsed)) {
      return true;
    }

    return isResumeWrapperPayload(parsed);
  }

  function parseCandidate(candidate) {
    if (candidateAppearsInSubmittedPrompt(candidate)) {
      return {
        ok: false,
        real: false,
        error: 'candidate is part of submitted prompt',
      };
    }

    try {
      const parsed = JSON.parse(repairJson(candidate));
      return {
        ok: true,
        real: isCapturedPayload(parsed),
      };
    } catch (error) {
      return {
        ok: false,
        real: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function expandToObject(text, anchorPos) {
    let depth = 0;
    let start = -1;

    for (let index = anchorPos; index >= 0; index -= 1) {
      if (text[index] === '}') {
        depth += 1;
      } else if (text[index] === '{') {
        if (depth === 0) {
          start = index;
          break;
        }
        depth -= 1;
      }
    }

    if (start === -1) {
      return '';
    }

    depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return '';
  }

  function jsonObjectCandidates(text) {
    const candidates = [];
    const anchors = [
      '"source_label"',
      '"profile"',
      '"entries"',
      '"contradictions"',
      '"sections"',
      '"contact"',
    ];

    for (const anchor of anchors) {
      let position = text.lastIndexOf(anchor);
      while (position !== -1) {
        const candidate = expandToObject(text, position);
        if (candidate && !candidates.includes(candidate)) {
          candidates.push(candidate);
        }
        position = text.lastIndexOf(anchor, position - 1);
      }
    }

    return candidates;
  }

  function parseBestCandidate(candidates) {
    let lastError = null;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      const parsed = parseCandidate(candidate);
      if (parsed.ok && parsed.real) {
        return { rawResponse: candidate, lastError };
      }
      if (parsed.error) {
        lastError = parsed.error;
      }

      const objectCandidates = jsonObjectCandidates(candidate);
      for (const objectCandidate of objectCandidates) {
        const objectParsed = parseCandidate(objectCandidate);
        if (objectParsed.ok && objectParsed.real) {
          return { rawResponse: objectCandidate, lastError };
        }
        if (objectParsed.error) {
          lastError = objectParsed.error;
        }
      }
    }

    return { rawResponse: '', lastError };
  }

  function extractFromText(text) {
    const delimitedCandidates = [
      ...text.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g),
    ]
      .map((match) => match[1]?.trim())
      .filter(Boolean);

    const objectCandidates = jsonObjectCandidates(text);
    const best = parseBestCandidate([...delimitedCandidates, ...objectCandidates]);
    if (best.rawResponse) {
      return {
        rawResponse: best.rawResponse,
        candidateCount: delimitedCandidates.length,
        objectCandidateCount: objectCandidates.length,
        method: best.rawResponse.includes('"entries"') ? 'object_or_delimited' : 'unknown',
      };
    }

    return {
      rawResponse: '',
      candidateCount: delimitedCandidates.length,
      objectCandidateCount: objectCandidates.length,
      lastError: best.lastError,
    };
  }

  const textSources = [
    { name: 'body.innerText', text: document.body?.innerText ?? '' },
    { name: 'body.textContent', text: document.body?.textContent ?? '' },
    {
      name: 'documentElement.innerText',
      text: document.documentElement?.innerText ?? '',
    },
    {
      name: 'documentElement.textContent',
      text: document.documentElement?.textContent ?? '',
    },
  ].filter((source) => source.text.trim());

  const selectorCounts = {};
  for (const selector of [
    '[data-testid="conversation-turn-assistant"]',
    'div.font-claude-message',
    'div.standard-markdown',
    '.font-claude-message',
    'pre code',
    'code',
  ]) {
    selectorCounts[selector] = document.querySelectorAll(selector).length;
  }

  const samples = [];
  for (const source of textSources) {
    const result = extractFromText(source.text);
    samples.push({
      source: source.name,
      length: source.text.length,
      hasStart: source.text.includes('---JSON-START---'),
      hasEnd: source.text.includes('---JSON-END---'),
      candidateCount: result.candidateCount,
      objectCandidateCount: result.objectCandidateCount,
      method: result.method ?? null,
      lastError: result.lastError ?? null,
    });

    if (result.rawResponse) {
      return {
        ok: true,
        rawResponse: result.rawResponse,
        source: source.name,
        samples,
        selectorCounts,
        title: document.title,
        url: location.href,
      };
    }
  }

  return {
    ok: false,
    samples,
    selectorCounts,
    title: document.title,
    url: location.href,
  };
}

async function startBackupCapturePoll(tabId, message) {
  const { appTabId, appRequestId, provider, sessionId } = message;
  const key = requestKey(appTabId, appRequestId);
  const started = Date.now();
  const timeoutMs = 570000;
  let lastDebugAt = 0;

  await reportDebug(
    'backup_poll_started',
    { provider, tabId, timeoutMs },
    appTabId,
    appRequestId,
  );

  while (Date.now() - started < timeoutMs) {
    if (completedCaptureRequests.has(key)) {
      await reportDebug(
        'backup_poll_stopped_already_completed',
        { elapsedMs: Date.now() - started },
        appTabId,
        appRequestId,
      );
      return;
    }

    let result;
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractDelimitedPayloadFromPage,
        args: [message.prompt ?? ''],
      });
      result = injection?.result;
    } catch (error) {
      await reportDebug(
        'backup_poll_injection_error',
        { error: error instanceof Error ? error.message : String(error) },
        appTabId,
        appRequestId,
      );
      await sleep(3000);
      continue;
    }

    if (result?.ok && result.rawResponse) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const session = {
        ...buildSession({
          provider,
          tabId,
          chatTitle: result.title || tab?.title,
          chatUrl: result.url || tab?.url,
        }),
        ...(sessionId ? { id: sessionId } : {}),
        lastUsedAt: Date.now(),
      };
      await saveSession(session);
      await reportDebug(
        'backup_poll_capture_found',
        {
          source: result.source,
          rawLength: result.rawResponse.length,
          samples: result.samples,
          selectorCounts: result.selectorCounts,
        },
        appTabId,
        appRequestId,
      );
      await relayResponseToApp(appTabId, appRequestId, {
        ok: true,
        rawResponse: result.rawResponse,
        session,
      });
      return;
    }

    if (Date.now() - lastDebugAt >= 10000) {
      await reportDebug(
        'backup_poll_sample',
        {
          elapsedMs: Date.now() - started,
          samples: result?.samples ?? [],
          selectorCounts: result?.selectorCounts ?? {},
        },
        appTabId,
        appRequestId,
      );
      lastDebugAt = Date.now();
    }

    await sleep(2000);
  }

  if (!completedCaptureRequests.has(key)) {
    await reportDebug(
      'backup_poll_timeout',
      { elapsedMs: Date.now() - started },
      appTabId,
      appRequestId,
    );
    await relayResponseToApp(appTabId, appRequestId, {
      ok: false,
      error:
        'Timed out waiting for delimited JSON in the provider tab. Diagnostics were captured in the import panel.',
    });
  }
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

async function startSendPrompt({ provider, prompt, appRequestId, appTabId }) {
  const tabId = await openNewChat(provider);
  await sleep(800);

  await startLlmCapture(tabId, {
    type: 'INJECT_PDF',
    provider,
    prompt,
    skipAttach: true,
    appRequestId,
    appTabId,
  });

  return { ok: true, async: true };
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

async function startSendPdf({
  provider,
  prompt,
  pdfBase64,
  filename,
  forceNewChat,
  appRequestId,
  appTabId,
}) {
  const tabId = forceNewChat
    ? await openNewChat(provider)
    : await openNewChat(provider);

  await sleep(800);

  await startLlmCapture(tabId, {
    type: 'INJECT_PDF',
    provider,
    prompt,
    pdfBase64,
    filename,
    skipAttach: false,
    appRequestId,
    appTabId,
  });

  return { ok: true, async: true };
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

async function startSendImprovement({
  sessionId,
  provider,
  tabId,
  chatTitle,
  prompt,
  appRequestId,
  appTabId,
}) {
  await resolveTab(tabId);
  await reportProgress(
    'returning_to_chat',
    `Returning to chat "${chatTitle || 'linked chat'}"…`,
  );

  await startLlmCapture(tabId, {
    type: 'INJECT_PDF',
    provider,
    prompt,
    skipAttach: true,
    sessionId,
    appRequestId,
    appTabId,
  });

  return { ok: true, async: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'LLM_CAPTURE_RESULT') {
        const provider = message.provider;
        const tabId = _sender.tab?.id;
        const key = requestKey(message.appTabId, message.appRequestId);
        const captureResponse = message.response ?? {
          ok: false,
          error: 'No response captured from provider tab.',
        };

        await reportDebug(
          'content_capture_result',
          {
            ok: captureResponse.ok === true,
            rawLength: captureResponse.rawResponse?.length ?? 0,
            error: captureResponse.error ?? null,
            tabId,
          },
          message.appTabId,
          message.appRequestId,
        );

        if (completedCaptureRequests.has(key)) {
          await reportDebug(
            'content_capture_result_ignored_duplicate',
            { ok: captureResponse.ok === true },
            message.appTabId,
            message.appRequestId,
          );
          sendResponse({ ok: true });
          return;
        }

        if (captureResponse.ok && tabId != null) {
          const session = {
            ...buildSession({
              provider,
              tabId,
              chatTitle: captureResponse.chatTitle,
              chatUrl: captureResponse.chatUrl,
            }),
            ...(message.sessionId ? { id: message.sessionId } : {}),
            lastUsedAt: Date.now(),
          };
          await saveSession(session);
          await relayResponseToApp(message.appTabId, message.appRequestId, {
            ok: true,
            rawResponse: captureResponse.rawResponse ?? '',
            session,
          });
        } else if (looksLikeDetectionError(captureResponse.error)) {
          await reportDebug(
            'content_detection_error_deferred_to_backup_poll',
            { error: captureResponse.error },
            message.appTabId,
            message.appRequestId,
          );
        } else {
          await relayResponseToApp(message.appTabId, message.appRequestId, captureResponse);
        }

        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'AI_PROGRESS') {
        await reportProgress(message.step, message.detail);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'AI_DEBUG') {
        const entry = message.entry ?? {
          at: new Date().toISOString(),
          event: 'debug_message_without_entry',
          detail: {},
          requestId: message.appRequestId ?? null,
        };
        await reportDebug(
          entry.event,
          entry.detail,
          message.appTabId ?? null,
          entry.requestId ?? message.appRequestId ?? null,
        );
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
        if (message.appRequestId && _sender.tab?.id != null) {
          sendResponse(
            await startSendPdf({
              ...message,
              appTabId: _sender.tab.id,
            }),
          );
          return;
        }
        sendResponse(await handleSendPdf(message));
        return;
      }

      if (message.type === 'SEND_PROMPT') {
        if (message.appRequestId && _sender.tab?.id != null) {
          sendResponse(
            await startSendPrompt({
              ...message,
              appTabId: _sender.tab.id,
            }),
          );
          return;
        }
        sendResponse(await handleSendPrompt(message));
        return;
      }

      if (message.type === 'SEND_IMPROVEMENT') {
        if (message.appRequestId && _sender.tab?.id != null) {
          sendResponse(
            await startSendImprovement({
              ...message,
              appTabId: _sender.tab.id,
            }),
          );
          return;
        }
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
