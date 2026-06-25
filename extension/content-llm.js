function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportProgress(step, detail) {
  chrome.runtime
    .sendMessage({ type: 'AI_PROGRESS', step, detail })
    .catch(() => {});
}

function getChatMetadata(provider) {
  const titleSelectors = [
    'title',
    '[data-testid="conversation-turn-title"]',
    'h1',
    '.chat-title',
  ];

  let chatTitle = document.title || 'Untitled chat';
  for (const selector of titleSelectors) {
    const node = document.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text && text.length > 0 && text.length < 120) {
      chatTitle = text.replace(/\s*-\s*Claude.*$/i, '').trim() || chatTitle;
      break;
    }
  }

  if (chatTitle === 'Claude' || chatTitle === 'ChatGPT' || chatTitle === 'Gemini') {
    chatTitle = `${provider} chat ${new Date().toLocaleTimeString()}`;
  }

  return {
    chatTitle,
    chatUrl: location.href,
  };
}

function clickElement(element) {
  element.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
  );
  element.dispatchEvent(
    new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
  );
  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
  );
  if (typeof element.click === 'function') {
    element.click();
  }
}

function setNativeValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  );
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextToEditableHtml(value) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split('\n').map(escapeHtml);
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}

function createTextDataTransfer(value) {
  try {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', value);
    transfer.setData('text/html', plainTextToEditableHtml(value));
    return transfer;
  } catch {
    return null;
  }
}

function dispatchTextInputEvents(element, value, inputType = 'insertText') {
  const dataTransfer =
    inputType === 'insertFromPaste' ? createTextDataTransfer(value) : null;

  element.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType,
      data: value,
      dataTransfer,
    }),
  );
  element.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType, data: value, dataTransfer }),
  );
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
}

function dispatchPasteEvent(element, value) {
  const clipboardData = createTextDataTransfer(value);
  if (!clipboardData) {
    return false;
  }

  try {
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function setContentEditableText(element, value) {
  element.focus({ preventScroll: true });

  if (element.isContentEditable) {
    dispatchPasteEvent(element, value);

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('insertText', false, value);
    } catch {
      element.textContent = value;
    }

    const insertedText = element.textContent?.trim() ?? '';
    if (!insertedText || !insertedText.includes(value.trim().slice(0, 40))) {
      element.innerHTML = plainTextToEditableHtml(value);
    }

    dispatchTextInputEvents(element, value, 'insertFromPaste');
    return;
  }

  element.textContent = value;
  dispatchTextInputEvents(element, value);
}

const PROVIDER_SELECTORS = {
  chatgpt: [
    '[data-message-author-role="assistant"]',
    '[data-testid="conversation-turn-assistant"]',
  ],
  claude: [
    '[data-testid="conversation-turn-assistant"]',
    'div.font-claude-message',
    'div.standard-markdown',
    '.font-claude-message',
  ],
  gemini: [
    'model-response .markdown',
    'model-response',
    '.model-response-text',
    '.message-content',
  ],
};

const GENERIC_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-testid="conversation-turn-assistant"]',
  'model-response',
  '.font-claude-message',
  '.model-response-text',
];

function isUsableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.disabled) {
    return false;
  }

  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // Background tabs often report 0×0 layout even when the composer exists in the DOM.
  if (document.hidden) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isVisible(element) {
  return isUsableElement(element);
}

function getSelectors(provider) {
  return PROVIDER_SELECTORS[provider] ?? GENERIC_SELECTORS;
}

function getAssistantTurnRoots(provider) {
  const roots = [];
  const seen = new Set();

  for (const selector of getSelectors(provider)) {
    document.querySelectorAll(selector).forEach((node) => {
      if (seen.has(node)) {
        return;
      }
      seen.add(node);
      roots.push(node);
    });
  }

  return roots;
}

function extractTextFromAssistantRoot(root) {
  if (!root) {
    return '';
  }

  const codeBlocks = root.querySelectorAll('pre code, code');
  for (let index = codeBlocks.length - 1; index >= 0; index -= 1) {
    const text = codeBlocks[index].textContent?.trim();
    if (text && looksLikeResumeJson(text)) {
      return text;
    }
  }

  for (let index = codeBlocks.length - 1; index >= 0; index -= 1) {
    const text = codeBlocks[index].textContent?.trim();
    if (text && text.length > 40) {
      return text;
    }
  }

  const markdown = root.querySelector('.markdown');
  if (markdown?.textContent?.trim()) {
    return markdown.textContent.trim();
  }

  return root.textContent?.trim() ?? '';
}

function getAssistantTexts(provider) {
  return getAssistantTurnRoots(provider)
    .map((root) => extractTextFromAssistantRoot(root))
    .filter(Boolean);
}

function getLatestAssistantText(provider) {
  const texts = getAssistantTexts(provider);
  if (texts.length === 0) {
    return '';
  }
  return texts[texts.length - 1];
}

function getCandidateResponseTexts(provider) {
  const candidates = [...getAssistantTexts(provider)];
  const selectors = [
    ...getSelectors(provider),
    'pre code',
    'code',
    '.markdown',
    '[data-testid*="code" i]',
    '[class*="code" i]',
    '[class*="markdown" i]',
  ];
  const seen = new Set(candidates);

  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => {
      const text = node.textContent?.trim();
      if (text && text.length > 40 && !seen.has(text)) {
        seen.add(text);
        candidates.push(text);
      }
    });
  }

  const bodyText = document.body?.innerText?.trim();
  if (bodyText && looksLikeCaptureJson(bodyText) && !seen.has(bodyText)) {
    candidates.push(bodyText);
  }

  return candidates;
}

function getBestJsonResponseText(provider, baselineText = '') {
  const candidates = getCandidateResponseTexts(provider);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const text = candidates[index];
    if (
      text &&
      text !== baselineText &&
      hasMeaningfulChange(text, baselineText) &&
      canParseResumeJson(text)
    ) {
      return text;
    }
  }

  return '';
}

function getBaselineText(provider) {
  return getLatestAssistantText(provider);
}

function isStopButtonActive() {
  const selectors = [
    'button[data-testid="stop-button"]:not([disabled])',
    'button[aria-label="Stop streaming"]:not([disabled])',
    'button[aria-label*="Stop generating"]:not([disabled])',
  ];

  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button && isVisible(button)) {
      return true;
    }
  }

  return false;
}

function isMessageStreaming(provider) {
  if (isStopButtonActive()) {
    return true;
  }

  const streamingNodes = document.querySelectorAll('[data-is-streaming="true"]');
  for (const node of streamingNodes) {
    if (isVisible(node)) {
      return true;
    }
  }

  const selectors = getSelectors(provider);
  for (const selector of selectors) {
    const nodes = document.querySelectorAll(selector);
    const last = nodes[nodes.length - 1];
    if (!last) {
      continue;
    }

    if (last.getAttribute('data-is-streaming') === 'true') {
      return true;
    }

    const inner = last.querySelector('[data-is-streaming="true"], .result-streaming');
    if (inner && isVisible(inner)) {
      return true;
    }
  }

  return false;
}

function looksLikeCaptureJson(text) {
  if (!text) {
    return false;
  }
  if (/```json/i.test(text)) {
    return true;
  }
  if (/"sections"\s*:/.test(text) && /"contact"\s*:/.test(text)) {
    return true;
  }
  if (/"entries"\s*:\s*\[/i.test(text)) {
    return true;
  }
  return false;
}

function looksLikeResumeJson(text) {
  return looksLikeCaptureJson(text);
}

function repairJson(json) {
  return json
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function extractJsonCandidate(text) {
  const fencedBlocks = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  if (fencedBlocks.length > 0) {
    return fencedBlocks[fencedBlocks.length - 1][1].trim();
  }

  const fenced = text.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return objectMatch[0].trim();
  }

  return '';
}

function canParseResumeJson(text) {
  if (!looksLikeResumeJson(text)) {
    return false;
  }

  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return false;
  }

  try {
    JSON.parse(repairJson(candidate));
    return true;
  } catch {
    return false;
  }
}

function hasCompleteJsonFence(text) {
  return /```json\s*[\s\S]*?```/i.test(text);
}

function hasMeaningfulChange(text, baselineText) {
  if (!text) {
    return false;
  }
  if (!baselineText) {
    return text.length > 40;
  }
  if (text === baselineText) {
    return false;
  }
  return text.length >= baselineText.length + 10 || looksLikeResumeJson(text);
}

async function waitForAssistantResponse(provider, baselineText, timeoutMs = 180000) {
  const started = Date.now();
  let lastText = '';
  let lastChangeAt = started;
  let sawStreaming = false;
  let lastProgressAt = 0;

  while (Date.now() - started < timeoutMs) {
    const streaming = isMessageStreaming(provider);
    const detectedJson = getBestJsonResponseText(provider, baselineText);
    const text = detectedJson || getLatestAssistantText(provider);
    const elapsedSeconds = Math.round((Date.now() - started) / 1000);

    if (Date.now() - lastProgressAt >= 1000) {
      if (streaming) {
        reportProgress('waiting', `Model is generating… (${elapsedSeconds}s)`);
      } else if (looksLikeResumeJson(text)) {
        reportProgress('waiting', `Finalizing JSON response… (${elapsedSeconds}s)`);
      } else {
        reportProgress('waiting', `Waiting for model response… (${elapsedSeconds}s)`);
      }
      lastProgressAt = Date.now();
    }

    if (streaming && !detectedJson) {
      sawStreaming = true;
      await sleep(350);
      continue;
    }

    if (hasMeaningfulChange(text, baselineText)) {
      if (text !== lastText) {
        lastText = text;
        lastChangeAt = Date.now();
      }

      const jsonReady =
        canParseResumeJson(text) &&
        (hasCompleteJsonFence(text) || !/```json/i.test(text));

      if (jsonReady) {
        await sleep(1200);
        const finalText = getLatestAssistantText(provider);
        if (!isMessageStreaming(provider) && canParseResumeJson(finalText || text)) {
          return finalText || text;
        }
      }

      if (
        sawStreaming &&
        looksLikeResumeJson(text) &&
        Date.now() - lastChangeAt >= 2500
      ) {
        await sleep(1200);
        const finalText = getLatestAssistantText(provider);
        if (!isMessageStreaming(provider) && canParseResumeJson(finalText || text)) {
          return finalText || text;
        }
      }
    }

    await sleep(350);
  }

  const fallback = getBestJsonResponseText(provider, baselineText) || getLatestAssistantText(provider);
  if (canParseResumeJson(fallback)) {
    return fallback;
  }

  if (hasMeaningfulChange(fallback, baselineText) && looksLikeCaptureJson(fallback)) {
    throw new Error(
      'Captured JSON looks incomplete. Wait for the full ```json block in the chat, then try again.',
    );
  }

  throw new Error(
    'Timed out waiting for the assistant reply. The response may be visible in chat but was not detected — try a fresh chat.',
  );
}

function findVisibleElement(selectors, root = document) {
  for (const selector of selectors) {
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      if (isVisible(node)) {
        return node;
      }
    }
  }
  return null;
}

function findElementByText(textPatterns, root = document) {
  const candidates = root.querySelectorAll(
    'button, [role="menuitem"], [role="option"], [role="menuitemradio"], a',
  );

  for (const node of candidates) {
    const text = node.textContent?.trim() ?? '';
    for (const pattern of textPatterns) {
      const matches =
        typeof pattern === 'string'
          ? text === pattern || text.includes(pattern)
          : pattern.test(text);
      if (matches && isVisible(node)) {
        return (
          node.closest('button, [role="menuitem"], [role="option"], a') ?? node
        );
      }
    }
  }

  return null;
}

async function waitForElement(getElement, { attempts = 10, delayMs = 500 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const element = getElement();
    if (element) {
      return element;
    }
    await sleep(delayMs);
  }
  return null;
}

function assignFileToInput(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function attachFileToGemini(file) {
  const menuButtonSelectors = [
    'gem-icon-button[aria-label="Upload & tools"]',
    'gem-icon-button[arialabel="Upload & tools"]',
    'button[aria-label="Upload & tools"]',
    '[aria-label="Upload & tools"]',
    'button[aria-label="Open upload file menu"]',
    'button[aria-label*="upload file menu" i]',
    'button[aria-label*="Upload" i]',
    'button.upload-card-button.open.mat-primary',
    'button[aria-label*="Add" i]',
  ];

  function findGeminiUploadMenuButton() {
    const direct = findVisibleElement(menuButtonSelectors);
    if (direct) {
      return direct;
    }

    const composer = findVisibleElement([
      'rich-textarea',
      'div.ql-editor[contenteditable="true"]',
      '.ql-container',
      '[aria-label*="Enter a prompt" i]',
    ]);
    if (!composer) {
      return null;
    }

    const root =
      composer.closest(
        'form, .input-area, .bottom-container, .input-container, .text-input-field',
      ) ?? composer.parentElement;
    if (!root) {
      return null;
    }

    const buttons = root.querySelectorAll('button, gem-icon-button');
    for (const button of buttons) {
      if (!isVisible(button)) {
        continue;
      }
      const label =
        button.getAttribute('aria-label') ??
        button.getAttribute('arialabel') ??
        '';
      if (/upload|attach|tool|file|add/i.test(label)) {
        return button;
      }
    }

    for (const button of buttons) {
      if (isVisible(button)) {
        return button;
      }
    }

    return null;
  }

  const menuButton = await waitForElement(findGeminiUploadMenuButton, {
    attempts: 12,
    delayMs: 600,
  });

  if (menuButton) {
    clickElement(menuButton);
    await sleep(700);

    const uploadItem = await waitForElement(
      () =>
        findElementByText([
          /^Upload files$/i,
          /^Files$/i,
          /Upload from computer/i,
          /Upload file/i,
        ]),
      { attempts: 10, delayMs: 400 },
    );

    if (uploadItem) {
      clickElement(uploadItem);
      await sleep(600);
    }
  }

  const input = await waitForElement(
    () =>
      findVisibleElement([
        'input[type="file"]',
        'input[accept*="pdf" i]',
        'input[accept*="file" i]',
        'input[multiple][type="file"]',
      ]) ?? document.querySelector('input[type="file"]'),
    { attempts: 12, delayMs: 400 },
  );

  if (!input) {
    throw new Error(
      'Could not find file upload on gemini. Open a new chat and try again.',
    );
  }

  assignFileToInput(input, file);
  await sleep(2000);
}

function mimeTypeForFilename(filename) {
  const lower = (filename ?? '').toLowerCase();
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/pdf';
}

async function attachFile(file, provider) {
  if (provider === 'gemini') {
    await attachFileToGemini(file);
    return;
  }

  let input = document.querySelector('input[type="file"]');

  if (!input) {
    const attachSelectors = [
      'button[aria-label*="Attach" i]',
      'button[aria-label*="Upload" i]',
      'button[aria-label*="Add file" i]',
      'button[aria-label*="file" i]',
      '[data-testid="composer-attach-files-button"]',
      '[data-testid="upload-file-btn"]',
      'button[aria-label*="Upload a file" i]',
    ];

    for (const selector of attachSelectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        if (button instanceof HTMLElement && isUsableElement(button)) {
          clickElement(button);
          await sleep(500);
          input = document.querySelector('input[type="file"]');
          if (input) {
            break;
          }
        }
      }
      if (input) {
        break;
      }
    }
  }

  if (!input) {
    throw new Error(
      `Could not find file upload on ${provider}. Open a new chat and try again.`,
    );
  }

  assignFileToInput(input, file);
}

function findComposerElement(selectors) {
  const visibleMatch = findVisibleElement(selectors);
  if (visibleMatch) {
    return visibleMatch;
  }

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement && isUsableElement(node)) {
      return node;
    }
  }

  return null;
}

function composerSelectors(provider) {
  return provider === 'gemini'
    ? [
        'div.ql-editor[contenteditable="true"]',
        'rich-textarea div[contenteditable="true"]',
        '[aria-label*="Enter a prompt" i][contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
      ]
    : [
        '#prompt-textarea',
        'textarea[placeholder]',
        'textarea[data-id]',
        'textarea',
        'div[contenteditable="true"][role="textbox"]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"]',
      ];
}

async function setPrompt(prompt, provider) {
  const selectors = composerSelectors(provider);
  const editableSelectors = selectors.filter((selector) =>
    selector.includes('contenteditable'),
  );

  // Prefer the visible composer (Claude/ChatGPT use contenteditable, not textarea).
  const editable = findComposerElement(editableSelectors);
  if (editable instanceof HTMLElement) {
    setContentEditableText(editable, prompt);
    return editable;
  }

  const textarea = findComposerElement(
    selectors.filter((sel) => sel.includes('textarea') || sel.startsWith('#')),
  );
  if (textarea instanceof HTMLTextAreaElement) {
    setNativeValue(textarea, prompt);
    return textarea;
  }

  throw new Error(
    `Could not find prompt input on ${provider}. Click into the chat box and retry.`,
  );
}

function getSendButtonSelectors(provider) {
  return provider === 'gemini'
    ? [
        'button[aria-label*="Send message" i]',
        '.send-button-container button',
        'button.send-button',
        '[data-test-id="send-button"]',
      ]
    : [
        'button[data-testid="send-button"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send"]',
        'button[aria-label*="Send"]',
        'button[type="submit"]',
      ];
}

function getComposerElement(provider) {
  const editable = findComposerElement(composerSelectors(provider));
  if (editable instanceof HTMLElement) {
    return editable;
  }

  return null;
}

function getElementText(element) {
  if (!element) {
    return '';
  }
  if (element instanceof HTMLTextAreaElement) {
    return element.value.trim();
  }
  const innerText =
    element instanceof HTMLElement && typeof element.innerText === 'string'
      ? element.innerText
      : '';
  return (innerText || element.textContent || '').trim();
}

function getComposerText(provider, composer = null) {
  const target = composer ?? getComposerElement(provider);
  const text = getElementText(target);
  if (text) {
    return text;
  }
  if (composer) {
    return getElementText(getComposerElement(provider));
  }
  return '';
}

function getComposerForm(composer) {
  if (!composer) {
    return null;
  }
  return composer.closest(
    'form, [data-testid*="composer" i], [class*="composer" i], [class*="input" i]',
  );
}

function normalizePromptText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function composerHasPrompt(provider, prompt, composer = null) {
  const composerText = normalizePromptText(getComposerText(provider, composer));
  const expected = normalizePromptText(prompt);
  if (!composerText || !expected) {
    return false;
  }

  const probeLength = Math.min(160, Math.max(40, Math.floor(expected.length * 0.15)));
  return composerText.includes(expected.slice(0, probeLength));
}

async function waitForPromptInsertion(provider, prompt, composer) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (composerHasPrompt(provider, prompt, composer)) {
      return;
    }
    await sleep(250);
  }

  const retryComposer = await setPrompt(prompt, provider);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (composerHasPrompt(provider, prompt, retryComposer)) {
      return;
    }
    await sleep(250);
  }

  // Do not block submit on a readback false-negative. Some provider editors
  // keep state outside textContent in background tabs.
}

function findSendButton(provider, requireEnabled = true) {
  const selectors = getSendButtonSelectors(provider);
  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLButtonElement && isUsableElement(candidate)) {
        if (!requireEnabled || !candidate.disabled) {
          return candidate;
        }
      }
    }
  }
  return null;
}

async function waitForEnabledSendButton(provider, timeoutMs = 30000) {
  const attempts = Math.ceil(timeoutMs / 300);
  const button = await waitForElement(
    () => findSendButton(provider, true),
    { attempts, delayMs: 300 },
  );

  if (!button) {
    throw new Error(
      'Send button stayed disabled. Open the chat tab, choose an available model, then retry Generate.',
    );
  }

  return button;
}

async function verifyMessageSubmitted(provider, promptLength, composer = null) {
  await sleep(document.hidden ? 1200 : 700);

  if (isStopButtonActive() || isMessageStreaming(provider)) {
    return true;
  }

  const composerText = getComposerText(provider, composer);
  const threshold = Math.min(80, Math.max(20, Math.floor(promptLength * 0.15)));
  if (composerText.length <= threshold) {
    return true;
  }

  return false;
}

async function submitWithKeyboard(provider, promptLength, composer = null) {
  const targetComposer = composer ?? getComposerElement(provider);
  if (!targetComposer) {
    return false;
  }

  targetComposer.focus({ preventScroll: true });

  for (const opts of [
    { key: 'Enter', code: 'Enter', metaKey: true },
    { key: 'Enter', code: 'Enter', ctrlKey: true },
    { key: 'Enter', code: 'Enter' },
  ]) {
    for (const target of [targetComposer, document]) {
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts }));
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...opts }));
    }
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer)) {
      return true;
    }
  }

  return false;
}

async function submitMessage(provider, promptLength = 0, composer = null) {
  const targetComposer = composer ?? getComposerElement(provider);
  const form = getComposerForm(targetComposer);
  const immediateButton = findSendButton(provider, false);

  if (immediateButton instanceof HTMLButtonElement && !immediateButton.disabled) {
    clickElement(immediateButton);
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer)) {
      return;
    }
  }

  if (form && typeof form.requestSubmit === 'function') {
    try {
      form.requestSubmit();
    } catch {
      const event =
        typeof SubmitEvent === 'function'
          ? new SubmitEvent('submit', { bubbles: true, cancelable: true })
          : new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);
    }
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer)) {
      return;
    }
  }

  if (await submitWithKeyboard(provider, promptLength, targetComposer)) {
    return;
  }

  const button = await waitForEnabledSendButton(provider);
  if (!button.disabled) {
    clickElement(button);
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer)) {
      return;
    }
  }

  if (await submitWithKeyboard(provider, promptLength, targetComposer)) {
    return;
  }

  throw new Error(
    'Prompt was pasted but not submitted. Check the chat tab — pick an available model and click Send, then retry.',
  );
}

async function sendAndCaptureResponse({
  provider,
  prompt,
  pdfBase64,
  filename,
  skipAttach = false,
}) {
  await waitForElement(() => getComposerElement(provider), {
    attempts: 24,
    delayMs: 500,
  });

  if (provider === 'gemini') {
    await waitForElement(
      () =>
        findVisibleElement([
          'div.ql-editor[contenteditable="true"]',
          'rich-textarea div[contenteditable="true"]',
          '[aria-label*="Enter a prompt" i][contenteditable="true"]',
        ]),
      { attempts: 12, delayMs: 600 },
    );
  }

  const baselineText = getBaselineText(provider);

  if (!skipAttach) {
    reportProgress('attaching_pdf', 'Attaching source file…');
    const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
    const file = new File([bytes], filename, { type: mimeTypeForFilename(filename) });
    await attachFile(file, provider);
    await sleep(1500);
    reportProgress('pdf_attached', 'Source file attached');
  } else {
    reportProgress('improvement_sent', 'Sending improvement prompt…');
  }

  reportProgress('pasting_prompt', 'Pasting edit instruction…');
  const composer = await setPrompt(prompt, provider);
  await waitForPromptInsertion(provider, prompt, composer);
  await sleep(document.hidden ? 1200 : 400);
  reportProgress('prompt_ready', 'Edit instruction ready');

  reportProgress('sending', `Sending to ${provider}…`);
  await submitMessage(provider, prompt.length, composer);
  reportProgress('sent', 'Prompt sent — generating response…');
  reportProgress('waiting', 'Waiting for model response…');

  const rawResponse = await waitForAssistantResponse(provider, baselineText);
  const metadata = getChatMetadata(provider);
  reportProgress('response_detected', 'Response detected');

  return {
    ok: true,
    rawResponse,
    chatTitle: metadata.chatTitle,
    chatUrl: metadata.chatUrl,
  };
}

if (!globalThis.__resumeBuilderLlmBridge) {
  globalThis.__resumeBuilderLlmBridge = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ ok: true });
      return true;
    }

    if (message.type !== 'INJECT_PDF') {
      return false;
    }

    sendAndCaptureResponse(message)
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Injection failed.',
        }),
      );

    return true;
  });
}
