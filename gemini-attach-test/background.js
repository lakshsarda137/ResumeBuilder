/*
 * Gemini .txt Attach Test — standalone experiment harness (3 variants).
 *
 * Pick a variant from the popup. Each opens a fresh Gemini tab in the
 * BACKGROUND (active:false, like the real extension) and tries to attach
 * dummy.txt + paste a prompt a different way:
 *
 *   1. baseline    — content-script attach (the real extension's path).
 *   2. foreground  — same, but the Gemini tab is switched to ACTIVE during the
 *                    attach, then switched back after the prompt is pasted.
 *                    Tests: "is it a focus/visibility problem?"
 *   3. cdp         — trusted file-set via CDP DOM.setFileInputFiles (the
 *                    Puppeteer/Playwright mechanism), plus a trusted CDP click
 *                    to open the "+" menu if the <input type=file> isn't present
 *                    yet; then paste the prompt via the content script.
 *                    Tests: "is it a trusted-event problem?"
 *
 * Truthfulness: content-llm.js is a BYTE-FOR-BYTE copy of
 * extension/content-llm.js. The CDP + tab-flow helpers below are copied
 * verbatim from extension/background.js. Only the debug SINK is adapted
 * (console.log instead of routing to a localhost app tab).
 *
 * Results: the service-worker console (chrome://extensions -> this extension ->
 * "Inspect views: service worker"), the opened Gemini tab, and the toolbar badge.
 */

const PROVIDERS = {
  gemini: { openUrl: 'https://gemini.google.com/app' },
};

const CDP_PROTOCOL_VERSION = '1.3';
const CDP_WAKE_PROVIDERS = new Set(['chatgpt', 'gemini', 'claude']);
const cdpWakeByKey = new Map();

// CDP DOM.setFileInputFiles reads files from disk by ABSOLUTE path (like
// Puppeteer). This is the real dummy.txt shipped in this extension folder.
// If you move the folder, update this path.
const DUMMY_TXT_ABS_PATH =
  '/Users/LakshSarda/Desktop/ResumeBuilder/gemini-attach-test/dummy.txt';

let pendingForegroundRestore = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestKey(appTabId, requestId) {
  return `${appTabId ?? 'no-tab'}:${requestId ?? 'no-request'}`;
}

/* ── Debug sinks (adapted: log to the SW console instead of an app tab) ───── */

async function reportDebug(event, detail = {}, appTabId = null, requestId = null) {
  console.log('[bg][debug]', event, detail);
}

async function reportProgress(step, detail) {
  console.log('[bg][progress]', step, detail ?? '');
}

/* ── VERBATIM from extension/background.js ────────────────────────────────── */

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

/* ── Variant 2: foreground the tab during attach, then restore ───────────── */

async function foregroundTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;
  const [prev] = await chrome.tabs.query({ active: true, windowId });
  const prevId = prev?.id ?? null;

  await chrome.tabs.update(tabId, { active: true });
  try {
    await chrome.windows.update(windowId, { focused: true });
  } catch {
    // ignore — window focus is best-effort
  }
  console.log('[bg] (foreground) switched to Gemini tab; will restore to tab', prevId);

  let done = false;
  return async () => {
    if (done) return;
    done = true;
    if (prevId != null) {
      try {
        await chrome.tabs.update(prevId, { active: true });
        console.log('[bg] (foreground) restored active tab ->', prevId);
      } catch (err) {
        console.warn('[bg] (foreground) restore failed:', err);
      }
    }
  };
}

/* ── Variant 3: trusted file attach via CDP ──────────────────────────────── */

function cdp(tabId, method, params = {}) {
  return chromeDebuggerSendCommand(debuggerTarget(tabId), method, params);
}

async function findFileInputObjectId(tabId) {
  const res = await cdp(tabId, 'Runtime.evaluate', {
    expression: "document.querySelector('input[type=file]')",
    returnByValue: false,
  });
  const r = res?.result;
  return r && r.subtype === 'node' && r.objectId ? r.objectId : null;
}

async function findUploadButtonCoords(tabId) {
  const expr = `(() => {
    const sels = [
      'button[aria-label="Upload & tools"]',
      'gem-icon-button[aria-label="Upload & tools"] button',
      'gem-icon-button[aria-label="Upload & tools"]',
      'button[aria-label*="Upload" i]',
      'button[aria-label*="attach" i]',
      'button[aria-label*="add file" i]',
      'button[aria-label*="add photos" i]',
      'button[aria-label*="insert" i]',
      'button[aria-label*="plus" i]',
      'button[aria-label*="Add" i]',
      'button[aria-label*="file" i]'
    ];
    const visible = (el) => el && el.getClientRects && el.getClientRects().length > 0;
    let btn = null, sel = null;
    for (const s of sels) {
      try {
        for (const el of document.querySelectorAll(s)) {
          if (visible(el)) { btn = el; sel = s; break; }
        }
      } catch (e) {}
      if (btn) break;
    }
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      label: btn.getAttribute('aria-label') || '',
      sel,
    };
  })()`;
  const res = await cdp(tabId, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  return res?.result?.value ?? null;
}

async function cdpTrustedClick(tabId, x, y) {
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
  });
  await cdp(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 1, clickCount: 1,
  });
}

async function runCdpAttach(tabId) {
  await cdp(tabId, 'DOM.enable', {});
  await cdp(tabId, 'Runtime.enable', {});

  // 1) A persistent <input type=file> may already exist.
  let objectId = await findFileInputObjectId(tabId);
  console.log('[bg] (cdp) initial input[type=file] present:', Boolean(objectId));

  // 2) Otherwise open the "+" menu with a TRUSTED CDP click, then re-check.
  if (!objectId) {
    const coords = await findUploadButtonCoords(tabId);
    console.log('[bg] (cdp) upload button coords:', coords);
    if (coords) {
      await cdpTrustedClick(tabId, coords.x, coords.y);
      await sleep(1500);
      objectId = await findFileInputObjectId(tabId);
      console.log('[bg] (cdp) input[type=file] after menu click:', Boolean(objectId));
    }
  }

  if (!objectId) {
    throw new Error('CDP: no <input type=file> found (even after opening the + menu).');
  }

  await cdp(tabId, 'DOM.setFileInputFiles', {
    files: [DUMMY_TXT_ABS_PATH],
    objectId,
  });
  console.log('[bg] (cdp) DOM.setFileInputFiles ->', DUMMY_TXT_ABS_PATH);
  await sleep(1500); // let Gemini register the file chip
}

/* ── Variant 4: CDP file-chooser interception (Playwright-style) ──────────── */
// Gemini's "+" menu -> "Upload files" opens the native OS picker, which is
// backed by a hidden <input type=file>. We intercept the native dialog via
// Page.setInterceptFileChooserDialog, click "Upload files" with a TRUSTED CDP
// click, grab the input's backendNodeId from Page.fileChooserOpened, and inject
// the file with DOM.setFileInputFiles. If no fileChooserOpened event fires, the
// upload uses the File System Access API (showOpenFilePicker) and is unscriptable.

// Enumerate every currently-visible, clickable-ish element (piercing open
// shadow roots) with its text + aria-label + center coords. Used both to FIND
// the "Upload files" item robustly and to DUMP the menu when we can't find it,
// so a failed run tells us exactly what Gemini's menu looks like now.
async function collectMenuCandidates(tabId) {
  const expr = `(() => {
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const out = [];
    const seen = new Set();
    const visit = (root) => {
      let els;
      try { els = root.querySelectorAll('*'); } catch (e) { return; }
      for (const el of els) {
        if (el.shadowRoot) visit(el.shadowRoot);
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const role = (el.getAttribute && el.getAttribute('role')) || '';
        const isCandidate =
          role === 'menuitem' || role === 'option' || role === 'menuitemradio' ||
          tag === 'button' || tag === 'a' || tag === 'li';
        if (!isCandidate) continue;
        if (!el.getClientRects || !el.getClientRects().length) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const text = norm(el.textContent);
        const aria = norm(el.getAttribute('aria-label'));
        if (!text && !aria) continue;
        const key = tag + '|' + text + '|' + aria + '|' + Math.round(r.left) + ',' + Math.round(r.top);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          text, aria, tag, role,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          len: text.length,
        });
      }
    };
    visit(document);
    return out;
  })()`;
  const res = await cdp(tabId, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  return res?.result?.value ?? [];
}

// Pick the best "Upload files" menu item from the candidate list. Robust to:
//   • Material-icon ligature text bleeding into textContent (substring match,
//     not startsWith),
//   • label variants ("Upload file", "Upload from computer", "Add files"),
//   • aria-label-only items (checks aria-label too).
// Skips Drive / URL / camera / photo entries unless they also say "upload", and
// prefers real menuitems + the shortest (leaf) matching element.
function pickUploadItem(candidates) {
  const scoreOf = (c) => {
    const t = (c.text || '').toLowerCase();
    const a = (c.aria || '').toLowerCase();
    const hay = t + ' ' + a;
    const hasUpload = /upload|attach|choose file|from (computer|your (device|computer))|browse/.test(hay);
    const hasFile = /\bfiles?\b|documents?|photos?/.test(hay);
    // Reject Drive / link / camera / screen items unless they're upload items.
    if (/\bdrive\b|\burl\b|\blink\b|camera|take a photo|screen/.test(hay) && !hasUpload) {
      return -1;
    }
    let s = -1;
    if (t === 'upload files' || a === 'upload files') s = 100;
    else if (hasUpload && hasFile) s = 90;
    else if (hasUpload) s = 70;
    else if (hasFile && (c.role === 'menuitem' || c.role === 'option')) s = 45;
    if (s < 0) return -1;
    if (c.role === 'menuitem' || c.role === 'option') s += 5;
    // Prefer shorter (leaf) elements over big containers holding the whole menu.
    s -= Math.min(20, Math.floor((c.len || 0) / 8));
    return s;
  };
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = scoreOf(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

async function waitForGeminiFileChip(tabId, maxMs = 15000) {
  const expr = `(() => {
    const els = [...document.querySelectorAll('div,span,button,li')];
    for (const el of els) {
      const t = (el.textContent || '').trim();
      if (t && t.length < 30 && /dummy/i.test(t) && el.getClientRects().length) return true;
    }
    return false;
  })()`;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const res = await cdp(tabId, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res?.result?.value === true) return true;
    await sleep(400);
  }
  return false;
}

async function runCdpFileChooser(tabId) {
  let chooserBackendNodeId = null;
  let gotEvent = false;

  const onEvent = (source, method, params) => {
    if (source.tabId !== tabId) return;
    if (method === 'Page.fileChooserOpened') {
      gotEvent = true;
      chooserBackendNodeId = params?.backendNodeId ?? null;
      console.log('[bg] (filechooser) Page.fileChooserOpened:', params);
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);

  try {
    await cdp(tabId, 'Page.enable', {});
    await cdp(tabId, 'DOM.enable', {});
    await cdp(tabId, 'Runtime.enable', {});

    // Suppress the native OS dialog and route it to Page.fileChooserOpened.
    await cdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: true });
    console.log('[bg] (filechooser) file-chooser interception enabled');

    // Open the "+" menu with a trusted click.
    const plus = await findUploadButtonCoords(tabId);
    console.log('[bg] (filechooser) + button:', plus);
    if (!plus) throw new Error('filechooser: "+" button not found');
    await cdpTrustedClick(tabId, plus.x, plus.y);

    // Poll for the "Upload files" item — the menu animates in, and its label /
    // structure varies across Gemini UI revisions, so give it a few tries.
    let item = null;
    let candidates = [];
    for (let i = 0; i < 12 && !item; i++) {
      await sleep(300);
      candidates = await collectMenuCandidates(tabId);
      item = pickUploadItem(candidates);
    }

    if (!item) {
      // Self-diagnosing: dump what the menu actually contains so the next run
      // tells us the real label instead of guessing.
      console.log(
        '[bg] (filechooser) NO upload item matched. Visible menu/button candidates:',
        candidates.map((c) => ({ text: c.text, aria: c.aria, tag: c.tag, role: c.role })),
      );
      throw new Error(
        'filechooser: "Upload files" item not found in DOM — see the candidates dump ' +
          'logged just above (menu may have not opened, or the label changed).',
      );
    }

    console.log('[bg] (filechooser) upload item picked:', {
      text: item.text,
      aria: item.aria,
      tag: item.tag,
      role: item.role,
      x: Math.round(item.x),
      y: Math.round(item.y),
    });
    await cdpTrustedClick(tabId, item.x, item.y);

    // Wait for the intercepted chooser event.
    for (let i = 0; i < 25 && !gotEvent; i++) await sleep(200);
    if (!gotEvent) {
      throw new Error(
        'filechooser: no Page.fileChooserOpened — Gemini likely uses the File System Access API (showOpenFilePicker), which cannot be fed programmatically.',
      );
    }
    if (chooserBackendNodeId == null) {
      throw new Error('filechooser: fileChooserOpened fired but carried no backendNodeId.');
    }

    await cdp(tabId, 'DOM.setFileInputFiles', {
      files: [DUMMY_TXT_ABS_PATH],
      backendNodeId: chooserBackendNodeId,
    });
    console.log('[bg] (filechooser) setFileInputFiles via backendNodeId ->', DUMMY_TXT_ABS_PATH);

    // Wait for Gemini to actually render + finish uploading the file chip BEFORE
    // the content script pastes + submits — otherwise the prompt is sent before
    // the upload completes and the file is left behind in the composer (the race
    // you saw). Poll for the chip, then give the upload a moment to finalize.
    const chipReady = await waitForGeminiFileChip(tabId);
    console.log('[bg] (filechooser) file chip present:', chipReady);
    await sleep(3000);
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    try {
      await cdp(tabId, 'Page.setInterceptFileChooserDialog', { enabled: false });
    } catch {
      // best-effort teardown
    }
  }
}

/* ── Shared inputs ────────────────────────────────────────────────────────── */

function base64FromText(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

const DUMMY_TEXT = [
  'DUMMY .TXT ATTACHMENT — Gemini attach experiment.',
  '',
  'If you can read this file, the .txt attachment reached Gemini intact.',
  'Line A: the quick brown fox jumps over the lazy dog.',
  'Line B: 1234567890 — em dash — smart quotes “like this”.',
  'END OF FILE.',
].join('\n');

// Content-probing prompt: only answerable by actually reading the attached file
// (no parroting). Correct answer is the exact "Line B: …" line from dummy.txt.
const COVER_PROMPT =
  'Read the attached file and reply with ONLY the full text of the line that begins with "Line B:". If no file is attached, reply exactly: NO FILE.';

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

/* ── Experiment runner ────────────────────────────────────────────────────── */

async function runExperiment(variant) {
  const appRequestId = `exp-${Date.now()}`;
  let tabId = null;
  pendingForegroundRestore = null;

  setBadge('…', '#888888');
  console.log(`[bg] ===== experiment start: ${variant} =====`);

  try {
    tabId = await openNewChat('gemini');
    await ensureLlmBridge(tabId);

    // Attach the CDP "wake" (this is what flips on the debugging banner). All
    // three variants keep this on so the only difference is the attach method.
    await startProviderCdpWake(tabId, {
      provider: 'gemini',
      appRequestId,
      appTabId: tabId,
    });

    if (variant === 'cdp' || variant === 'filechooser') {
      if (variant === 'cdp') {
        await runCdpAttach(tabId);
      } else {
        await runCdpFileChooser(tabId);
      }
      // File is set via CDP; now paste + submit the prompt through the content
      // script (skipAttach:true means "don't attach, just paste + submit").
      const resp = await chrome.tabs.sendMessage(tabId, {
        type: 'INJECT_PDF',
        provider: 'gemini',
        prompt: COVER_PROMPT,
        skipAttach: true,
      });
      console.log(`[bg] (${variant}) paste response:`, resp);
      setBadge(resp?.ok ? 'OK' : 'ERR', resp?.ok ? '#2e7d32' : '#c62828');
    } else {
      if (variant === 'foreground') {
        pendingForegroundRestore = await foregroundTab(tabId);
      }

      // Content-script attach path — the real extension's behavior.
      const resp = await chrome.tabs.sendMessage(tabId, {
        type: 'INJECT_PDF',
        provider: 'gemini',
        prompt: COVER_PROMPT,
        pdfBase64: base64FromText(DUMMY_TEXT),
        filename: 'dummy.txt',
        skipAttach: false,
      });
      console.log(`[bg] (${variant}) INJECT_PDF response:`, resp);
      setBadge(resp?.ok ? 'OK' : 'ERR', resp?.ok ? '#2e7d32' : '#c62828');

      // If prompt_ready never fired (attach threw), restore here.
      if (pendingForegroundRestore) {
        const fn = pendingForegroundRestore;
        pendingForegroundRestore = null;
        await fn();
      }
    }
  } catch (err) {
    console.error(`[bg] (${variant}) experiment failed:`, err);
    setBadge('ERR', '#c62828');
    if (pendingForegroundRestore) {
      const fn = pendingForegroundRestore;
      pendingForegroundRestore = null;
      await fn();
    }
  } finally {
    await stopProviderCdpWake(requestKey(tabId, appRequestId), 'experiment_done');
    console.log(`[bg] ===== experiment end: ${variant} =====`);
  }
}

/* ── Messaging ────────────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RUN_EXPERIMENT') {
    runExperiment(msg.variant || 'baseline');
    return;
  }

  // Surface content-llm.js's own attach/paste stages in the SW console.
  if (msg?.type === 'AI_DEBUG') {
    console.log('[content][debug]', msg.entry?.event, msg.entry?.detail);
    return;
  }

  if (msg?.type === 'AI_PROGRESS') {
    console.log('[content][progress]', msg.step, msg.detail ?? '');
    // Foreground variant: switch back as soon as the prompt is pasted.
    if (msg.step === 'prompt_ready' && pendingForegroundRestore) {
      const fn = pendingForegroundRestore;
      pendingForegroundRestore = null;
      fn();
    }
    return;
  }
});
