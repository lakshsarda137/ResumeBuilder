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
  pruneCaptureState().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  reportDebug('background_started', { backupPoller: true }).catch(() => {});
  resumePendingBackupCaptures('startup').catch((error) => {
    reportDebug('backup_poll_resume_failed', {
      error: error instanceof Error ? error.message : String(error),
    }).catch(() => {});
  });
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  const key = backupCaptureKeyFromAlarmName(alarm.name);
  if (!key) {
    return;
  }

  runBackupCaptureTick(key, 'alarm').catch((error) => {
    getPendingBackupCapture(key)
      .then((state) =>
        reportDebug(
          'backup_poll_alarm_tick_crashed',
          { error: error instanceof Error ? error.message : String(error) },
          state?.appTabId ?? null,
          state?.appRequestId ?? null,
        ),
      )
      .catch(() => {});
  });
});

chrome.debugger?.onDetach?.addListener((source, reason) => {
  const detachedStates = [...cdpWakeByKey.values()].filter(
    (state) => state.tabId === source.tabId,
  );
  for (const state of detachedStates) {
    cdpWakeByKey.delete(state.key);
    reportDebug(
      'cdp_wake_detached',
      {
        tabId: state.tabId,
        provider: state.provider,
        reason,
        elapsedMs: Date.now() - state.startedAt,
      },
      state.appTabId,
      state.appRequestId,
    ).catch(() => {});
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const completedCaptureRequests = new Set();
const backupCaptureTimers = new Map();
const backupCaptureTicksInFlight = new Set();
const cdpWakeByKey = new Map();
const BACKUP_CAPTURE_TIMEOUT_MS = 570000;
const BACKUP_CAPTURE_TIMER_MS = 2000;
const BACKUP_CAPTURE_ALARM_DELAY_MINUTES = 0.5;
const BACKUP_CAPTURE_PENDING_PREFIX = 'llm_capture_pending_';
const BACKUP_CAPTURE_COMPLETED_PREFIX = 'llm_capture_completed_';
const BACKUP_CAPTURE_ALARM_PREFIX = 'llm-capture-';
const CDP_PROTOCOL_VERSION = '1.3';
const CDP_WAKE_PROVIDERS = new Set(['chatgpt', 'gemini']);

function requestKey(appTabId, requestId) {
  return `${appTabId ?? 'no-tab'}:${requestId ?? 'no-request'}`;
}

function pendingCaptureStorageKey(key) {
  return `${BACKUP_CAPTURE_PENDING_PREFIX}${key}`;
}

function completedCaptureStorageKey(key) {
  return `${BACKUP_CAPTURE_COMPLETED_PREFIX}${key}`;
}

function backupCaptureAlarmName(key) {
  return `${BACKUP_CAPTURE_ALARM_PREFIX}${key}`;
}

function backupCaptureKeyFromAlarmName(name) {
  if (!name?.startsWith(BACKUP_CAPTURE_ALARM_PREFIX)) {
    return '';
  }
  return name.slice(BACKUP_CAPTURE_ALARM_PREFIX.length);
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

async function getPendingBackupCapture(key) {
  const storageKey = pendingCaptureStorageKey(key);
  const item = await chrome.storage.local.get(storageKey);
  return item[storageKey] ?? null;
}

async function savePendingBackupCapture(state) {
  await chrome.storage.local.set({
    [pendingCaptureStorageKey(state.key)]: state,
  });
}

async function clearPendingBackupCapture(key) {
  const timerId = backupCaptureTimers.get(key);
  if (timerId != null) {
    clearTimeout(timerId);
    backupCaptureTimers.delete(key);
  }

  await Promise.allSettled([
    chrome.storage.local.remove(pendingCaptureStorageKey(key)),
    chrome.alarms?.clear(backupCaptureAlarmName(key)) ?? Promise.resolve(),
  ]);
  await stopProviderCdpWake(key, 'pending_capture_cleared');
}

async function isCaptureCompletedByKey(key) {
  if (completedCaptureRequests.has(key)) {
    return true;
  }

  const storageKey = completedCaptureStorageKey(key);
  const item = await chrome.storage.local.get(storageKey);
  if (item[storageKey]) {
    completedCaptureRequests.add(key);
    return true;
  }

  return false;
}

async function markCaptureCompleted(appTabId, requestId) {
  const key = requestKey(appTabId, requestId);
  completedCaptureRequests.add(key);
  await Promise.allSettled([
    chrome.storage.local.set({
      [completedCaptureStorageKey(key)]: Date.now(),
    }),
    clearPendingBackupCapture(key),
  ]);
}

async function pruneCaptureState() {
  const allItems = await chrome.storage.local.get(null);
  const now = Date.now();
  const staleKeys = [];

  for (const [key, value] of Object.entries(allItems)) {
    if (
      key.startsWith(BACKUP_CAPTURE_PENDING_PREFIX) &&
      value?.startedAt &&
      now - value.startedAt > BACKUP_CAPTURE_TIMEOUT_MS + 300000
    ) {
      staleKeys.push(key);
    }

    if (
      key.startsWith(BACKUP_CAPTURE_COMPLETED_PREFIX) &&
      typeof value === 'number' &&
      now - value > 3600000
    ) {
      staleKeys.push(key);
    }
  }

  if (staleKeys.length > 0) {
    await chrome.storage.local.remove(staleKeys);
  }
}

async function resumePendingBackupCaptures(reason = 'resume') {
  await pruneCaptureState();

  const allItems = await chrome.storage.local.get(null);
  const pendingStates = Object.entries(allItems)
    .filter(([key]) => key.startsWith(BACKUP_CAPTURE_PENDING_PREFIX))
    .map(([, value]) => value)
    .filter((state) => state?.key);

  for (const state of pendingStates) {
    await reportDebug(
      'backup_poll_resumed',
      {
        elapsedMs: Date.now() - state.startedAt,
        provider: state.provider,
        tabId: state.tabId,
        reason,
      },
      state.appTabId,
      state.appRequestId,
    );
    await startProviderCdpWake(state.tabId, {
      provider: state.provider,
      appTabId: state.appTabId,
      appRequestId: state.appRequestId,
    });
    await scheduleBackupCaptureWake(state.key);
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

function debuggerTarget(tabId) {
  return { tabId };
}

function chromeDebuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, CDP_PROTOCOL_VERSION, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function chromeDebuggerDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function chromeDebuggerSendCommand(target, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

async function startProviderCdpWake(tabId, message) {
  if (
    !CDP_WAKE_PROVIDERS.has(message.provider) ||
    !message.appRequestId ||
    message.appTabId == null
  ) {
    return;
  }

  const key = requestKey(message.appTabId, message.appRequestId);
  if (cdpWakeByKey.has(key)) {
    return;
  }

  if (!chrome.debugger?.attach) {
    await reportDebug(
      'cdp_wake_unavailable',
      { provider: message.provider, tabId },
      message.appTabId,
      message.appRequestId,
    );
    return;
  }

  const target = debuggerTarget(tabId);
  const state = {
    key,
    tabId,
    target,
    provider: message.provider,
    appTabId: message.appTabId,
    appRequestId: message.appRequestId,
    attached: false,
    startedAt: Date.now(),
  };

  try {
    await chromeDebuggerAttach(target);
    state.attached = true;
    cdpWakeByKey.set(key, state);

    const commands = [
      {
        method: 'Emulation.setFocusEmulationEnabled',
        params: { enabled: true },
      },
      {
        method: 'Page.setWebLifecycleState',
        params: { state: 'active' },
      },
    ];
    const results = [];

    for (const command of commands) {
      try {
        await chromeDebuggerSendCommand(target, command.method, command.params);
        results.push({ method: command.method, ok: true });
      } catch (error) {
        results.push({
          method: command.method,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await reportDebug(
      'cdp_wake_started',
      {
        provider: message.provider,
        tabId,
        experimental: message.provider === 'gemini',
        commands: results,
        note: 'No tab activation or Page.bringToFront was used.',
      },
      message.appTabId,
      message.appRequestId,
    );
  } catch (error) {
    cdpWakeByKey.delete(key);
    await reportDebug(
      'cdp_wake_failed',
      {
        provider: message.provider,
        tabId,
        error: error instanceof Error ? error.message : String(error),
      },
      message.appTabId,
      message.appRequestId,
    );
  }
}

async function stopProviderCdpWake(key, reason = 'stop') {
  const state = cdpWakeByKey.get(key);
  if (!state) {
    return;
  }

  cdpWakeByKey.delete(key);

  try {
    if (state.attached) {
      await chromeDebuggerDetach(state.target);
    }
    await reportDebug(
      'cdp_wake_stopped',
      {
        provider: state.provider,
        tabId: state.tabId,
        reason,
        elapsedMs: Date.now() - state.startedAt,
      },
      state.appTabId,
      state.appRequestId,
    );
  } catch (error) {
    await reportDebug(
      'cdp_wake_stop_failed',
      {
        provider: state.provider,
        tabId: state.tabId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      },
      state.appTabId,
      state.appRequestId,
    );
  }
}

async function relayResponseToApp(appTabId, requestId, response) {
  if (appTabId == null || !requestId) {
    return;
  }

  await markCaptureCompleted(appTabId, requestId);
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
  await startProviderCdpWake(tabId, message);

  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, {
      ...message,
      asyncCapture: true,
    });
  } catch (error) {
    await stopProviderCdpWake(
      requestKey(message.appTabId, message.appRequestId),
      'content_message_failed',
    );
    throw error;
  }

  if (!response?.ok) {
    await stopProviderCdpWake(
      requestKey(message.appTabId, message.appRequestId),
      'content_request_rejected',
    );
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
      '"baseline"',
      '"optimized"',
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

  const captureSelectors = [
    '[data-message-author-role="assistant"]',
    '[data-testid="conversation-turn-assistant"]',
    'article[data-testid^="conversation-turn-"]',
    'pre code',
    'code',
    '.markdown',
    '[data-testid*="code" i]',
    '[class*="code" i]',
    '[class*="markdown" i]',
    'div.font-claude-message',
    'div.standard-markdown',
    '.font-claude-message',
  ];

  const selectorTextSources = [];
  for (const selector of captureSelectors) {
    document.querySelectorAll(selector).forEach((node, index) => {
      if (node instanceof HTMLElement && node.innerText?.trim()) {
        selectorTextSources.push({
          name: `${selector}[${index}].innerText`,
          text: node.innerText,
        });
      }
      if (node.textContent?.trim()) {
        selectorTextSources.push({
          name: `${selector}[${index}].textContent`,
          text: node.textContent,
        });
      }
    });
  }

  const pageTextSources = [
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
  ];

  const seenTexts = new Set();
  const textSources = [...selectorTextSources, ...pageTextSources]
    .filter((source) => source.text.trim())
    .filter((source) => {
      const key = source.text.trim();
      if (seenTexts.has(key)) {
        return false;
      }
      seenTexts.add(key);
      return true;
    });

  const selectorCounts = {};
  for (const selector of captureSelectors) {
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
  const state = {
    key,
    tabId,
    appTabId,
    appRequestId,
    provider,
    sessionId: sessionId ?? null,
    prompt: message.prompt ?? '',
    startedAt: Date.now(),
    timeoutMs: BACKUP_CAPTURE_TIMEOUT_MS,
    lastDebugAt: 0,
    attemptCount: 0,
  };

  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});

  await savePendingBackupCapture(state);
  await reportDebug(
    'backup_poll_started',
    {
      provider,
      tabId,
      timeoutMs: state.timeoutMs,
      timerMs: BACKUP_CAPTURE_TIMER_MS,
      alarmDelayMinutes: BACKUP_CAPTURE_ALARM_DELAY_MINUTES,
    },
    appTabId,
    appRequestId,
  );

  await runBackupCaptureTick(key, 'start');
}

function scheduleBackupCaptureTimer(key) {
  const existingTimerId = backupCaptureTimers.get(key);
  if (existingTimerId != null) {
    clearTimeout(existingTimerId);
  }

  const timerId = setTimeout(() => {
    backupCaptureTimers.delete(key);
    runBackupCaptureTick(key, 'timer').catch((error) => {
      const statePromise = getPendingBackupCapture(key);
      statePromise
        .then((state) =>
          reportDebug(
            'backup_poll_timer_tick_crashed',
            { error: error instanceof Error ? error.message : String(error) },
            state?.appTabId ?? null,
            state?.appRequestId ?? null,
          ),
        )
        .catch(() => {});
    });
  }, BACKUP_CAPTURE_TIMER_MS);

  backupCaptureTimers.set(key, timerId);
}

async function scheduleBackupCaptureWake(key) {
  scheduleBackupCaptureTimer(key);
  if (!chrome.alarms?.create) {
    return;
  }

  try {
    await chrome.alarms.create(backupCaptureAlarmName(key), {
      delayInMinutes: BACKUP_CAPTURE_ALARM_DELAY_MINUTES,
    });
  } catch (error) {
    const state = await getPendingBackupCapture(key);
    await reportDebug(
      'backup_poll_alarm_schedule_error',
      { error: error instanceof Error ? error.message : String(error) },
      state?.appTabId ?? null,
      state?.appRequestId ?? null,
    );
  }
}

async function attemptBackupCapture(state, reason) {
  const { appTabId, appRequestId, provider, tabId, prompt } = state;
  let result;
  let contentSnapshot = null;

  try {
    const contentResult = await chrome.tabs.sendMessage(tabId, {
      type: 'CAPTURE_NOW',
      provider,
      prompt: prompt ?? '',
    });
    contentSnapshot = contentResult?.snapshot ?? null;
    if (contentResult?.ok && contentResult.rawResponse) {
      result = {
        ok: true,
        rawResponse: contentResult.rawResponse,
        source: 'content-script CAPTURE_NOW',
        samples: contentSnapshot?.pageSamples ?? [],
        selectorCounts: contentSnapshot?.selectorCounts ?? {},
        title: contentResult.chatTitle,
        url: contentResult.chatUrl,
      };
    }
  } catch (error) {
    await reportDebug(
      'backup_poll_content_capture_error',
      { error: error instanceof Error ? error.message : String(error), reason },
      appTabId,
      appRequestId,
    );
  }

  try {
    if (!result?.ok) {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractDelimitedPayloadFromPage,
        args: [prompt ?? ''],
      });
      result = injection?.result;
    }
  } catch (error) {
    await reportDebug(
      'backup_poll_injection_error',
      { error: error instanceof Error ? error.message : String(error), reason },
      appTabId,
      appRequestId,
    );
    return { result: null, contentSnapshot, injectionError: error };
  }

  return { result, contentSnapshot, injectionError: null };
}

async function runBackupCaptureTick(key, reason = 'manual') {
  if (backupCaptureTicksInFlight.has(key)) {
    return;
  }

  backupCaptureTicksInFlight.add(key);
  try {
    let state = await getPendingBackupCapture(key);
    if (!state) {
      return;
    }

    const {
      appTabId,
      appRequestId,
      provider,
      sessionId,
      tabId,
      startedAt,
      timeoutMs,
    } = state;

    if (await isCaptureCompletedByKey(key)) {
      await reportDebug(
        'backup_poll_stopped_already_completed',
        { elapsedMs: Date.now() - startedAt, reason },
        appTabId,
        appRequestId,
      );
      await clearPendingBackupCapture(key);
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      await reportDebug(
        'backup_poll_timeout',
        { elapsedMs: Date.now() - startedAt, reason },
        appTabId,
        appRequestId,
      );
      await relayResponseToApp(appTabId, appRequestId, {
        ok: false,
        error:
          'Timed out waiting for delimited JSON in the provider tab. Diagnostics were captured in the import panel.',
      });
      return;
    }

    await startProviderCdpWake(tabId, {
      provider,
      appTabId,
      appRequestId,
    });

    let { result, contentSnapshot, injectionError } = await attemptBackupCapture(
      state,
      reason,
    );

    if (injectionError) {
      await scheduleBackupCaptureWake(key);
      return;
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
          elapsedMs: Date.now() - startedAt,
          reason,
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

    state = {
      ...state,
      attemptCount: (state.attemptCount ?? 0) + 1,
    };

    if (Date.now() - (state.lastDebugAt ?? 0) >= 10000) {
      await reportDebug(
        'backup_poll_sample',
        {
          elapsedMs: Date.now() - startedAt,
          attemptCount: state.attemptCount,
          reason,
          samples: result?.samples ?? contentSnapshot?.pageSamples ?? [],
          selectorCounts: result?.selectorCounts ?? contentSnapshot?.selectorCounts ?? {},
        },
        appTabId,
        appRequestId,
      );
      state.lastDebugAt = Date.now();
    }

    await savePendingBackupCapture(state);
    await scheduleBackupCaptureWake(key);
  } finally {
    backupCaptureTicksInFlight.delete(key);
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

        if (await isCaptureCompletedByKey(key)) {
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
