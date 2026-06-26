function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reportProgress(step, detail) {
  chrome.runtime
    .sendMessage({ type: 'AI_PROGRESS', step, detail })
    .catch(() => {});
}

function reportDebug(event, detail = {}, context = {}) {
  chrome.runtime
    .sendMessage({
      type: 'AI_DEBUG',
      entry: {
        at: new Date().toISOString(),
        event,
        detail,
        requestId: context.appRequestId ?? null,
      },
      appTabId: context.appTabId ?? null,
    })
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

function getElementCenter(element) {
  const rect =
    element instanceof Element ? element.getBoundingClientRect() : null;
  return {
    x: rect && rect.width > 0 ? rect.left + rect.width / 2 : 20,
    y: rect && rect.height > 0 ? rect.top + rect.height / 2 : 20,
  };
}

function dispatchPointerLikeEvent(element, type, overrides = {}) {
  const { x, y } = getElementCenter(element);
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    buttons: type === 'pointerup' || type === 'mouseup' || type === 'click' ? 0 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    ...overrides,
  };

  const event =
    type.startsWith('pointer') && typeof PointerEvent === 'function'
      ? new PointerEvent(type, init)
      : new MouseEvent(type.replace(/^pointer/, 'mouse'), init);

  element.dispatchEvent(event);
  return event.defaultPrevented;
}

function activateElementWithPointer(element) {
  if (typeof element.focus === 'function') {
    element.focus({ preventScroll: true });
  }

  for (const type of [
    'pointerover',
    'pointerenter',
    'mouseover',
    'mouseenter',
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ]) {
    dispatchPointerLikeEvent(element, type);
  }

  if (typeof element.click === 'function') {
    element.click();
  }
}

function activateElementWithKey(element, key) {
  if (typeof element.focus === 'function') {
    element.focus({ preventScroll: true });
  }

  const code = key === ' ' ? 'Space' : key;
  for (const target of [element, document]) {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        code,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        composed: true,
        key,
        code,
      }),
    );
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

function getPromptProbe(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, Math.min(160, Math.max(40, Math.floor(normalized.length * 0.15))));
}

function elementContainsPromptProbe(element, value) {
  const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
  const probe = getPromptProbe(value);
  return Boolean(text && probe && text.includes(probe));
}

function clearEditableElement(element) {
  element.focus({ preventScroll: true });
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('delete', false);
    return;
  } catch {
    // Fall through to direct DOM clearing.
  }

  element.textContent = '';
}

async function insertEditableTextInChunks(element, value) {
  const chunkSize = 4000;
  clearEditableElement(element);

  for (let index = 0; index < value.length; index += chunkSize) {
    const chunk = value.slice(index, index + chunkSize);
    element.focus({ preventScroll: true });

    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, chunk);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      return false;
    }

    dispatchTextInputEvents(element, chunk, 'insertText');
    if (index > 0 && index % (chunkSize * 3) === 0) {
      await sleep(25);
    }
  }

  return elementContainsPromptProbe(element, value);
}

async function setContentEditableText(element, value) {
  element.focus({ preventScroll: true });

  if (element.isContentEditable) {
    let inserted = false;
    clearEditableElement(element);

    if (value.length <= 12_000 && dispatchPasteEvent(element, value)) {
      await sleep(50);
      inserted = true;
    }

    if (!inserted || !elementContainsPromptProbe(element, value)) {
      inserted = await insertEditableTextInChunks(element, value);
    }

    if (!inserted || !elementContainsPromptProbe(element, value)) {
      element.innerHTML = plainTextToEditableHtml(value);
      inserted = true;
    }

    dispatchTextInputEvents(element, value, inserted ? 'insertFromPaste' : 'insertText');
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
    'model-response',
    'message-content[role="model"]',
    '[data-message-role="model"]',
    'ms-chat-turn[type="model"] ms-text-chunk',
    'ms-chat-turn[type="model"]',
    'ms-prompt-response',
    'model-response .markdown',
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

// Given a position inside `text`, walk outward to find the outermost { }.
function expandToOutermostObject(text, anchorPos) {
  // Walk left to find the opening { at depth 0
  let depth = 0;
  let start = -1;
  for (let i = anchorPos; i >= 0; i--) {
    if (text[i] === '}') depth++;
    else if (text[i] === '{') {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start === -1) return '';

  // Walk right from start to find the matching closing }
  depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return '';
}

function isRealImportPayload(parsed) {
  if (!parsed || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    return false;
  }
  // The prompt itself contains a schema object, so do not accept placeholder
  // schema values as a captured import response.
  return parsed.entries.some((e) => {
    const type = typeof e.type === 'string' ? e.type.trim() : '';
    const title = typeof e.title === 'string' ? e.title.trim().toLowerCase() : '';
    const freewrite = typeof e.freewrite === 'string' ? e.freewrite.trim() : '';

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

  const contactName =
    typeof parsed.contact?.name === 'string' ? parsed.contact.name.trim() : '';
  if (contactName && contactName.toLowerCase() !== 'string') {
    return true;
  }

  return parsed.sections.some((section) => {
    const id = typeof section.id === 'string' ? section.id.trim().toLowerCase() : '';
    const title =
      typeof section.title === 'string' ? section.title.trim().toLowerCase() : '';
    const type = typeof section.type === 'string' ? section.type.trim() : '';

    if (id && id !== 'string' && title && title !== 'string') {
      return true;
    }

    if (
      type &&
      type !== 'education | experience | projects | skills | custom' &&
      title &&
      title !== 'string'
    ) {
      return true;
    }

    const entries = Array.isArray(section.entries) ? section.entries : [];
    if (
      entries.some((entry) => {
        const entryTitle =
          typeof entry.title === 'string' ? entry.title.trim().toLowerCase() : '';
        return entryTitle && entryTitle !== 'string';
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
      return (label && label !== 'string') || (items && items !== 'string');
    });
  });
}

function isCapturedPayload(parsed) {
  return isRealImportPayload(parsed) || isRealResumePayload(parsed);
}

function parseJsonSafely(candidate) {
  try {
    return JSON.parse(repairJson(candidate));
  } catch {
    return null;
  }
}

function getDelimitedJsonCandidates(text) {
  if (!text) {
    return [];
  }

  return [...text.matchAll(/---JSON-START---\s*([\s\S]*?)\s*---JSON-END---/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);
}

function extractDelimitedJson(text) {
  const candidates = getDelimitedJsonCandidates(text);

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const parsed = parseJsonSafely(candidate);
    if (parsed && isCapturedPayload(parsed)) {
      return candidate;
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (parseJsonSafely(candidate)) {
      return candidate;
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const anchorResult = extractResponseJsonFromPageText(candidate);
    if (anchorResult) {
      return anchorResult;
    }
  }

  return '';
}

function extractResponseJsonFromPageText(text) {
  const anchors = ['"freewrite":', '"source_label":', '"entries":'];
  for (const anchor of anchors) {
    let pos = text.lastIndexOf(anchor);
    while (pos !== -1) {
      const candidate = expandToOutermostObject(text, pos);
      if (candidate) {
        try {
          const parsed = JSON.parse(repairJson(candidate));
          if (isRealImportPayload(parsed)) {
            return candidate;
          }
        } catch {
          // try earlier occurrence
        }
      }
      pos = text.lastIndexOf(anchor, pos - 1);
    }
  }
  return '';
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
    const delimited = extractDelimitedJson(text);
    if (
      delimited &&
      delimited !== baselineText &&
      hasMeaningfulChange(delimited, baselineText)
    ) {
      return delimited;
    }

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

function getParseableResponseText(provider, baselineText = '') {
  const domResult = getBestJsonResponseText(provider, baselineText);
  if (domResult) {
    return domResult;
  }

  const pageText = getFullPageText();
  const delimitedPageResult = extractDelimitedJson(pageText);
  if (delimitedPageResult && hasMeaningfulChange(delimitedPageResult, baselineText)) {
    return delimitedPageResult;
  }

  // Claude occasionally changes assistant DOM wrappers before our selectors
  // catch up. Use page-text object extraction as a fallback, but only for a
  // real import payload so the prompt schema cannot be mistaken for output.
  const pageResult = extractResponseJsonFromPageText(pageText);
  if (pageResult && hasMeaningfulChange(pageResult, baselineText)) {
    return pageResult;
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
  // import payload shape: { source_label, profile, entries }
  if (/"source_label"\s*:/.test(text) || (/"profile"\s*:/.test(text) && /"entries"\s*:/.test(text))) {
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

function hasSentinel(text) {
  return /---JSON-END---/.test(text) || /---END---/.test(text);
}

function getPageTextCandidates() {
  const candidates = [
    document.body?.innerText,
    document.body?.textContent,
    document.documentElement?.innerText,
    document.documentElement?.textContent,
  ]
    .map((text) => text?.trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

function getFullPageText() {
  return getPageTextCandidates().join('\n\n');
}

function extractDelimitedJsonFromPage() {
  for (const text of getPageTextCandidates()) {
    const candidate = extractDelimitedJson(text);
    if (candidate) {
      return candidate;
    }
  }

  return extractDelimitedJson(getFullPageText());
}

function getCaptureSnapshot(provider) {
  const pageSamples = getPageTextCandidates().map((text, index) => ({
    index,
    length: text.length,
    hasJsonStart: text.includes('---JSON-START---'),
    hasJsonEnd: text.includes('---JSON-END---'),
    delimitedCandidateCount: getDelimitedJsonCandidates(text).length,
    looksLikeCaptureJson: looksLikeCaptureJson(text),
  }));

  const selectorCounts = {};
  for (const selector of getSelectors(provider)) {
    selectorCounts[selector] = document.querySelectorAll(selector).length;
  }
  selectorCounts['pre code'] = document.querySelectorAll('pre code').length;
  selectorCounts.code = document.querySelectorAll('code').length;

  const assistantTexts = getAssistantTexts(provider);
  return {
    hidden: document.hidden,
    url: location.href,
    title: document.title,
    streaming: isMessageStreaming(provider),
    assistantTextCount: assistantTexts.length,
    latestAssistantLength: assistantTexts[assistantTexts.length - 1]?.length ?? 0,
    pageSamples,
    selectorCounts,
  };
}

async function waitForAssistantResponse(provider, baselineText, timeoutMs = 360000, debugContext = {}) {
  const started = Date.now();
  let lastProgressAt = 0;
  let lastDebugAt = 0;
  let stableCandidate = '';
  let stableCandidateSince = 0;

  reportDebug(
    'content_wait_started',
    {
      provider,
      timeoutMs,
      baselineLength: baselineText?.length ?? 0,
      snapshot: getCaptureSnapshot(provider),
    },
    debugContext,
  );

  while (Date.now() - started < timeoutMs) {
    const elapsedSeconds = Math.round((Date.now() - started) / 1000);
    const streaming = isMessageStreaming(provider);

    if (Date.now() - lastProgressAt >= 1000) {
      reportProgress('waiting', streaming
        ? `Model is generating… (${elapsedSeconds}s)`
        : document.hidden
          ? `Provider tab is in the background — waiting for generation to start… (${elapsedSeconds}s)`
          : `Waiting for model to start generating… (${elapsedSeconds}s)`);
      lastProgressAt = Date.now();
    }

    if (Date.now() - lastDebugAt >= 10000) {
      reportDebug(
        'content_wait_sample',
        {
          elapsedMs: Date.now() - started,
          snapshot: getCaptureSnapshot(provider),
        },
        debugContext,
      );
      lastDebugAt = Date.now();
    }

    // If Claude has rendered the requested delimited payload anywhere in the
    // page text, capture it immediately. This avoids depending on assistant DOM
    // selectors or streaming flags, both of which have changed under us.
    const pageDelimited = extractDelimitedJsonFromPage();
    if (pageDelimited && hasMeaningfulChange(pageDelimited, baselineText)) {
      reportDebug(
        'content_capture_page_delimited',
        {
          elapsedMs: Date.now() - started,
          rawLength: pageDelimited.length,
          snapshot: getCaptureSnapshot(provider),
        },
        debugContext,
      );
      return pageDelimited;
    }

    const assistantTexts = getAssistantTexts(provider);
    const assistantHasSentinel = assistantTexts.some(
      (text) =>
        text !== baselineText &&
        hasMeaningfulChange(text, baselineText) &&
        hasSentinel(text),
    );

    // Primary: sentinel string in an assistant response. The user prompt also
    // contains the sentinel instructions, so page-wide sentinel checks are too
    // eager and can race before the answer exists.
    if (assistantHasSentinel) {
      // Wait for streaming to fully stop — sentinel can appear mid-stream on
      // providers like Gemini that render tokens in real time.
      for (let i = 0; i < 40; i++) {
        if (!isMessageStreaming(provider)) break;
        await sleep(300);
      }
      await sleep(400);

      // Best path: explicit delimiters — unambiguous regardless of DOM or page text order.
      const finalPage = getFullPageText();
      const delimited = extractDelimitedJson(finalPage);
      if (delimited) {
        reportDebug(
          'content_capture_sentinel_delimited',
          { elapsedMs: Date.now() - started, rawLength: delimited.length },
          debugContext,
        );
        return delimited;
      }

      // Fallback: try DOM elements (works for Claude/ChatGPT).
      const domResult = getParseableResponseText(provider, baselineText);
      if (domResult) {
        reportDebug(
          'content_capture_dom_parseable',
          { elapsedMs: Date.now() - started, rawLength: domResult.length },
          debugContext,
        );
        return domResult;
      }

      // Last resort: anchor-based extraction from page text.
      const responseJson = extractResponseJsonFromPageText(finalPage);
      if (responseJson) {
        reportDebug(
          'content_capture_anchor_json',
          { elapsedMs: Date.now() - started, rawLength: responseJson.length },
          debugContext,
        );
        return responseJson;
      }

      reportDebug(
        'content_capture_final_page_fallback',
        { elapsedMs: Date.now() - started, rawLength: finalPage.length },
        debugContext,
      );
      return finalPage;
    }

    const parseableCandidate = getParseableResponseText(provider, baselineText);
    if (parseableCandidate) {
      if (parseableCandidate !== stableCandidate) {
        stableCandidate = parseableCandidate;
        stableCandidateSince = Date.now();
      } else if (Date.now() - stableCandidateSince >= (streaming ? 8000 : 2200)) {
        reportDebug(
          'content_capture_stable_parseable',
          {
            elapsedMs: Date.now() - started,
            rawLength: parseableCandidate.length,
            streaming,
          },
          debugContext,
        );
        return parseableCandidate;
      }
    } else {
      stableCandidate = '';
      stableCandidateSince = 0;
    }

    await sleep(350);
  }

  const fallback = getParseableResponseText(provider, baselineText) || getLatestAssistantText(provider);
  if (canParseResumeJson(fallback)) {
    reportDebug(
      'content_capture_timeout_fallback_parseable',
      { rawLength: fallback.length, snapshot: getCaptureSnapshot(provider) },
      debugContext,
    );
    return fallback;
  }

  if (hasMeaningfulChange(fallback, baselineText) && looksLikeCaptureJson(fallback)) {
    reportDebug(
      'content_capture_incomplete_json',
      { rawLength: fallback.length, snapshot: getCaptureSnapshot(provider) },
      debugContext,
    );
    throw new Error(
      'Captured JSON looks incomplete. Wait for the full ```json block in the chat, then try again.',
    );
  }

  reportDebug(
    'content_capture_timeout_no_payload',
    { fallbackLength: fallback.length, snapshot: getCaptureSnapshot(provider) },
    debugContext,
  );
  throw new Error(
    'Timed out waiting for the assistant reply. The response may be visible in chat but was not detected — try a fresh chat.',
  );
}

function getDeepSearchRoots(root = document) {
  const roots = [root];
  const seen = new Set(roots);
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current?.querySelectorAll) {
      continue;
    }

    current.querySelectorAll('*').forEach((node) => {
      if (node.shadowRoot && !seen.has(node.shadowRoot)) {
        seen.add(node.shadowRoot);
        roots.push(node.shadowRoot);
        stack.push(node.shadowRoot);
      }
    });
  }

  return roots;
}

function querySelectorAllDeep(selector, root = document) {
  const results = [];
  const seen = new Set();

  for (const searchRoot of getDeepSearchRoots(root)) {
    searchRoot.querySelectorAll(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        results.push(node);
      }
    });
  }

  return results;
}

function querySelectorDeep(selector, root = document) {
  return querySelectorAllDeep(selector, root)[0] ?? null;
}

function findVisibleElement(selectors, root = document) {
  for (const selector of selectors) {
    const nodes = querySelectorAllDeep(selector, root);
    for (const node of nodes) {
      if (isVisible(node)) {
        return node;
      }
    }
  }
  return null;
}

function findElementByText(textPatterns, root = document) {
  const candidates = querySelectorAllDeep(
    'button, [role="menuitem"], [role="option"], [role="menuitemradio"], a',
    root,
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

function getGeminiUploadSnapshot() {
  const buttonNodes = querySelectorAllDeep(
    [
      'button',
      'gem-icon-button',
      '[role="button"]',
      '[role="menuitem"]',
      '[role="option"]',
      'a',
      'mat-icon',
    ].join(','),
  ).filter((node) => node instanceof HTMLElement);

  const buttons = [
    ...buttonNodes,
  ].slice(0, 120).map((node, index) => ({
      index,
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      role: node.getAttribute('role') ?? '',
      text: node.textContent?.trim().slice(0, 80) ?? '',
      ariaLabel:
        node.getAttribute('aria-label') ??
        node.getAttribute('arialabel') ??
        '',
      title: node.getAttribute('title') ?? '',
      dataTestId: node.getAttribute('data-testid') ?? '',
      className: String(node.className ?? '').slice(0, 180),
      disabled: isDisabledForClick(node),
      visible: isVisible(node),
      outerHTML: node.outerHTML.slice(0, 500),
    }));

  const inputs = [...querySelectorAllDeep('input[type="file"]')].map(
    (node, index) => ({
      index,
      accept: node.getAttribute('accept') ?? '',
      multiple: node.hasAttribute('multiple'),
      id: node.id || '',
      name: node.getAttribute('name') ?? '',
      ariaLabel: node.getAttribute('aria-label') ?? '',
      className: String(node.className ?? '').slice(0, 180),
      visible: node instanceof HTMLElement ? isVisible(node) : false,
      outerHTML: node.outerHTML.slice(0, 500),
    }),
  );

  const uploadRelated = buttonNodes
    .map((node, index) => {
      const haystack = [
        node.textContent,
        node.getAttribute('aria-label'),
        node.getAttribute('arialabel'),
        node.getAttribute('title'),
        node.getAttribute('role'),
        node.getAttribute('data-testid'),
        String(node.className ?? ''),
        node.outerHTML.slice(0, 500),
      ]
        .join(' ')
        .toLowerCase();

      if (!/upload|file|attach|tool|add|plus|\+|drive|photo|image/.test(haystack)) {
        return null;
      }

      return {
        index,
        tag: node.tagName.toLowerCase(),
        text: node.textContent?.trim().slice(0, 120) ?? '',
        ariaLabel:
          node.getAttribute('aria-label') ??
          node.getAttribute('arialabel') ??
          '',
        title: node.getAttribute('title') ?? '',
        role: node.getAttribute('role') ?? '',
        className: String(node.className ?? '').slice(0, 180),
        visible: isVisible(node),
        outerHTML: node.outerHTML.slice(0, 700),
      };
    })
    .filter(Boolean)
    .slice(0, 80);

  const active = document.activeElement;

  return {
    hidden: document.hidden,
    visibilityState: document.visibilityState,
    location: location.href,
    title: document.title,
    activeElement:
      active instanceof HTMLElement
        ? {
            tag: active.tagName.toLowerCase(),
            id: active.id || '',
            ariaLabel: active.getAttribute('aria-label') ?? '',
            className: String(active.className ?? '').slice(0, 180),
          }
        : null,
    counts: {
      buttons: buttonNodes.length,
      fileInputs: inputs.length,
      openShadowRoots: Math.max(0, getDeepSearchRoots().length - 1),
      uploadRelated: uploadRelated.length,
    },
    inputs,
    uploadRelated,
    buttons,
  };
}

function findAnyGeminiFileInput() {
  return querySelectorDeep(
    [
      'input[type="file"]',
      'input[accept*="pdf" i]',
      'input[accept*="file" i]',
      'input[multiple][type="file"]',
    ].join(','),
  );
}

function getGeminiDropTargets() {
  const selectors = [
    'div.ql-editor[contenteditable="true"]',
    'rich-textarea',
    '[aria-label*="Enter a prompt" i]',
    '[contenteditable="true"]',
    'main',
    'body',
  ];
  const targets = [];
  const seen = new Set();

  for (const selector of selectors) {
    for (const node of querySelectorAllDeep(selector)) {
      if (node instanceof HTMLElement && !seen.has(node) && isVisible(node)) {
        seen.add(node);
        targets.push(node);
      }
    }
  }

  for (const node of [document.body, document.documentElement]) {
    if (node && !seen.has(node)) {
      seen.add(node);
      targets.push(node);
    }
  }

  return targets;
}

function getDragEventInit(target, transfer) {
  const rect =
    target instanceof Element ? target.getBoundingClientRect() : null;
  const clientX = rect && rect.width > 0 ? rect.left + rect.width / 2 : 20;
  const clientY = rect && rect.height > 0 ? rect.top + rect.height / 2 : 20;

  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    dataTransfer: transfer,
  };
}

function dispatchDragEvent(target, type, init) {
  const event =
    typeof DragEvent === 'function'
      ? new DragEvent(type, init)
      : new Event(type, {
          bubbles: init.bubbles,
          cancelable: init.cancelable,
          composed: init.composed,
        });

  if (!('dataTransfer' in event)) {
    Object.defineProperty(event, 'dataTransfer', {
      configurable: true,
      enumerable: true,
      value: init.dataTransfer,
    });
  }

  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function dispatchFileDrop(target, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  transfer.setData('text/plain', file.name);
  transfer.effectAllowed = 'copy';
  transfer.dropEffect = 'copy';

  const path = [
    window,
    document,
    document.documentElement,
    document.body,
    target,
  ].filter(Boolean);

  let defaultPrevented = false;
  for (const dropTarget of path) {
    const init = getDragEventInit(
      dropTarget instanceof Window ? document.documentElement : dropTarget,
      transfer,
    );

    for (const type of ['dragenter', 'dragover']) {
      defaultPrevented =
        dispatchDragEvent(dropTarget, type, init) || defaultPrevented;
    }
  }

  const dropInit = getDragEventInit(target, transfer);
  defaultPrevented =
    dispatchDragEvent(target, 'drop', dropInit) || defaultPrevented;

  for (const dropTarget of [...path].reverse()) {
    const init = getDragEventInit(
      dropTarget instanceof Window ? document.documentElement : dropTarget,
      transfer,
    );
    dispatchDragEvent(dropTarget, 'dragleave', init);
  }

  return defaultPrevented;
}

function geminiPageMentionsFilename(filename) {
  const normalizedFilename = filename.trim().toLowerCase();
  if (!normalizedFilename) {
    return false;
  }

  const bodyText = (document.body?.innerText || document.body?.textContent || '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (bodyText.includes(normalizedFilename)) {
    return true;
  }

  return querySelectorAllDeep(
    [
      '[class*="file" i]',
      '[class*="upload" i]',
      '[class*="attachment" i]',
      '[aria-label*="file" i]',
      '[aria-label*="upload" i]',
      'mat-chip',
      '.mat-mdc-chip',
    ].join(','),
  ).some((node) => {
    const text = [
      node.textContent,
      node.getAttribute?.('aria-label'),
      node.getAttribute?.('title'),
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(normalizedFilename);
  });
}

async function tryDropFileOnGemini(file, debugContext = {}) {
  const targets = getGeminiDropTargets();
  reportDebug(
    'gemini_attach_drop_started',
    {
      targetCount: targets.length,
      targets: targets.slice(0, 8).map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: node.textContent?.trim().slice(0, 80) ?? '',
        ariaLabel: node.getAttribute('aria-label') ?? '',
        className: String(node.className ?? '').slice(0, 120),
      })),
    },
    debugContext,
  );

  for (const target of targets) {
    const defaultPrevented = dispatchFileDrop(target, file);
    await sleep(1200);

    const createdInput = findAnyGeminiFileInput();
    if (createdInput instanceof HTMLInputElement) {
      assignFileToInput(createdInput, file);
      await sleep(2000);
      reportDebug(
        'gemini_attach_drop_created_input_assigned',
        {
          target: {
            tag: target.tagName.toLowerCase(),
            ariaLabel: target.getAttribute('aria-label') ?? '',
            className: String(target.className ?? '').slice(0, 120),
          },
          defaultPrevented,
          snapshot: getGeminiUploadSnapshot(),
        },
        debugContext,
      );
      return true;
    }

    if (geminiPageMentionsFilename(file.name)) {
      reportDebug(
        'gemini_attach_drop_acknowledged',
        {
          target: {
            tag: target.tagName.toLowerCase(),
            ariaLabel: target.getAttribute('aria-label') ?? '',
            className: String(target.className ?? '').slice(0, 120),
          },
          defaultPrevented,
          snapshot: getGeminiUploadSnapshot(),
        },
        debugContext,
      );
      return true;
    }
  }

  reportDebug(
    'gemini_attach_drop_not_acknowledged',
    { snapshot: getGeminiUploadSnapshot() },
    debugContext,
  );
  return false;
}

async function attachFileToGemini(file, debugContext = {}) {
  const menuButtonSelectors = [
    'button[aria-label="Upload & tools"]',
    'button[arialabel="Upload & tools"]',
    'button[aria-label="Open upload file menu"]',
    'button[aria-label*="upload file menu" i]',
    'button[aria-label*="Upload" i]',
    'button.upload-card-button.open.mat-primary',
    'button[aria-label*="Add" i]',
    'gem-icon-button[aria-label="Upload & tools"] button',
    'gem-icon-button[arialabel="Upload & tools"] button',
    'gem-icon-button[aria-label="Upload & tools"]',
    'gem-icon-button[arialabel="Upload & tools"]',
    '[aria-label="Upload & tools"]',
  ];

  function getNativeClickable(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    if (
      element.matches('button, a, [role="button"], [role="menuitem"]') &&
      isVisible(element)
    ) {
      return element;
    }

    const nested = querySelectorAllDeep(
      'button, a, [role="button"], [role="menuitem"]',
      element,
    ).find((node) => node instanceof HTMLElement && isVisible(node));

    return nested instanceof HTMLElement ? nested : element;
  }

  function findGeminiUploadMenuButton() {
    const direct = findVisibleElement(menuButtonSelectors);
    if (direct) {
      return getNativeClickable(direct);
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

    const buttons = querySelectorAllDeep('button, gem-icon-button', root);
    for (const button of buttons) {
      if (!isVisible(button)) {
        continue;
      }
      const label =
        button.getAttribute('aria-label') ??
        button.getAttribute('arialabel') ??
        '';
      if (/upload|attach|tool|file|add/i.test(label)) {
        return getNativeClickable(button);
      }
    }

    for (const button of buttons) {
      if (isVisible(button)) {
        return getNativeClickable(button);
      }
    }

    return null;
  }

  function findGeminiUploadItem() {
    return findElementByText([
      /^Upload files$/i,
      /^Files$/i,
      /Upload from computer/i,
      /Upload file/i,
    ]);
  }

  function findGeminiFileInput() {
    return (
      findVisibleElement([
        'input[type="file"]',
        'input[accept*="pdf" i]',
        'input[accept*="file" i]',
        'input[multiple][type="file"]',
      ]) ?? querySelectorDeep('input[type="file"]')
    );
  }

  async function waitForGeminiUploadSurface() {
    return waitForElement(
      () => {
        const item = findGeminiUploadItem();
        if (item) {
          return { kind: 'menuitem', element: item };
        }

        const input = findGeminiFileInput();
        if (input) {
          return { kind: 'input', element: input };
        }

        return null;
      },
      { attempts: 5, delayMs: 350 },
    );
  }

  async function activateGeminiUploadMenu(menuButton) {
    const attempts = [
      {
        name: 'pointer_mouse_native_click',
        run: () => activateElementWithPointer(menuButton),
      },
      {
        name: 'keyboard_enter',
        run: () => activateElementWithKey(menuButton, 'Enter'),
      },
      {
        name: 'keyboard_space',
        run: () => activateElementWithKey(menuButton, ' '),
      },
      {
        name: 'legacy_click',
        run: () => clickElement(menuButton),
      },
    ];

    for (const attempt of attempts) {
      const beforeExpanded = menuButton.getAttribute('aria-expanded') ?? '';
      attempt.run();
      const surface = await waitForGeminiUploadSurface();
      const afterExpanded = menuButton.getAttribute('aria-expanded') ?? '';
      reportDebug(
        'gemini_attach_menu_activation_attempt',
        {
          attempt: attempt.name,
          beforeExpanded,
          afterExpanded,
          surfaceKind: surface?.kind ?? null,
          activeElement:
            document.activeElement instanceof HTMLElement
              ? {
                  tag: document.activeElement.tagName.toLowerCase(),
                  ariaLabel: document.activeElement.getAttribute('aria-label') ?? '',
                  className: String(document.activeElement.className ?? '').slice(0, 120),
                }
              : null,
          snapshot: getGeminiUploadSnapshot(),
        },
        debugContext,
      );

      if (surface) {
        return surface;
      }
    }

    return null;
  }

  reportDebug(
    'gemini_attach_started',
    {
      filename: file.name,
      size: file.size,
      type: file.type,
      snapshot: getGeminiUploadSnapshot(),
    },
    debugContext,
  );

  const existingInput = findAnyGeminiFileInput();
  if (existingInput instanceof HTMLInputElement) {
    assignFileToInput(existingInput, file);
    await sleep(2000);
    reportDebug(
      'gemini_attach_existing_input_assigned',
      { snapshot: getGeminiUploadSnapshot() },
      debugContext,
    );
    return;
  }

  const menuButton = await waitForElement(findGeminiUploadMenuButton, {
    attempts: 12,
    delayMs: 600,
  });

  if (menuButton) {
    reportDebug(
      'gemini_attach_menu_button_found',
      {
        tag: menuButton.tagName.toLowerCase(),
        text: menuButton.textContent?.trim().slice(0, 80) ?? '',
        ariaLabel:
          menuButton.getAttribute('aria-label') ??
          menuButton.getAttribute('arialabel') ??
          '',
        className: String(menuButton.className ?? '').slice(0, 180),
        outerHTML: menuButton.outerHTML.slice(0, 700),
        hidden: document.hidden,
      },
      debugContext,
    );
    const uploadSurface = await activateGeminiUploadMenu(menuButton);

    if (uploadSurface?.kind === 'input' && uploadSurface.element instanceof HTMLInputElement) {
      assignFileToInput(uploadSurface.element, file);
      await sleep(2000);
      reportDebug(
        'gemini_attach_menu_created_input_assigned',
        { snapshot: getGeminiUploadSnapshot() },
        debugContext,
      );
      return;
    }

    if (uploadSurface?.kind === 'menuitem' && uploadSurface.element instanceof HTMLElement) {
      const uploadItem = uploadSurface.element;
      reportDebug(
        'gemini_attach_upload_item_found',
        {
          tag: uploadItem.tagName.toLowerCase(),
          text: uploadItem.textContent?.trim().slice(0, 80) ?? '',
          hidden: document.hidden,
        },
        debugContext,
      );
      activateElementWithPointer(uploadItem);
      await sleep(600);
    } else {
      reportDebug(
        'gemini_attach_upload_item_missing',
        { snapshot: getGeminiUploadSnapshot() },
        debugContext,
      );
    }
  } else {
    reportDebug(
      'gemini_attach_menu_button_missing',
      { snapshot: getGeminiUploadSnapshot() },
      debugContext,
    );
  }

  const input = await waitForElement(
    () => findGeminiFileInput(),
    { attempts: 12, delayMs: 400 },
  );

  if (!input) {
    if (await tryDropFileOnGemini(file, debugContext)) {
      return;
    }

    reportDebug(
      'gemini_attach_file_input_missing',
      { snapshot: getGeminiUploadSnapshot() },
      debugContext,
    );
    throw new Error(
      'Could not find file upload on gemini. Open a new chat and try again.',
    );
  }

  assignFileToInput(input, file);
  await sleep(2000);
  reportDebug(
    'gemini_attach_file_input_assigned',
    { snapshot: getGeminiUploadSnapshot() },
    debugContext,
  );
}

function mimeTypeForFilename(filename) {
  const lower = (filename ?? '').toLowerCase();
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/pdf';
}

async function attachFile(file, provider, debugContext = {}) {
  if (provider === 'gemini') {
    await attachFileToGemini(file, debugContext);
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
    await setContentEditableText(editable, prompt);
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

function getSubmitCandidateSelectors(provider) {
  return [
    ...getSendButtonSelectors(provider),
    '[aria-label*="Send" i]',
    '[data-testid*="send" i]',
    '[class*="send" i]',
    '[type="submit"]',
    '[role="button"]',
    'button',
  ];
}

function isDisabledForClick(element) {
  return (
    element.disabled === true ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.getAttribute('data-disabled') === 'true' ||
    element.classList.contains('disabled')
  );
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
  const target =
    composer instanceof HTMLElement && composer.isConnected
      ? composer
      : getComposerElement(provider);
  const text = getElementText(target);
  if (text) {
    return text;
  }
  if (composer instanceof HTMLElement && composer.isConnected) {
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

function pageHasSubmittedPrompt(provider, prompt, baselineText = '') {
  const expected = normalizePromptText(prompt);
  if (!expected) {
    return false;
  }

  const probeLength = Math.min(180, Math.max(60, Math.floor(expected.length * 0.12)));
  const probe = expected.slice(0, probeLength);
  const texts = getCandidateResponseTexts(provider);

  return texts.some((text) => {
    const normalized = normalizePromptText(text);
    return (
      normalized !== normalizePromptText(baselineText) &&
      normalized.includes(probe)
    );
  });
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
  const selectors = getSubmitCandidateSelectors(provider);
  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement && isUsableElement(candidate)) {
        const label = [
          candidate.getAttribute('aria-label'),
          candidate.getAttribute('data-testid'),
          candidate.getAttribute('type'),
          candidate.textContent,
          candidate.className,
        ]
          .join(' ')
          .toLowerCase();
        const looksLikeSend =
          /send|submit/.test(label) ||
          candidate.closest('[data-testid*="composer" i], [class*="composer" i]');

        if (looksLikeSend && (!requireEnabled || !isDisabledForClick(candidate))) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function getSendButtonSnapshot(provider) {
  return getSubmitCandidateSelectors(provider).map((selector) => {
    const nodes = [...document.querySelectorAll(selector)].filter(
      (node) => node instanceof HTMLElement,
    );
    return {
      selector,
      count: nodes.length,
      buttons: nodes.slice(0, 5).map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: node.textContent?.trim().slice(0, 80) ?? '',
        ariaLabel: node.getAttribute('aria-label') ?? '',
        disabled: isDisabledForClick(node),
        visible: isUsableElement(node),
      })),
    };
  });
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

async function verifyMessageSubmitted(
  provider,
  promptLength,
  composer = null,
  prompt = '',
  baselineText = '',
  debugContext = {},
) {
  const attempts = document.hidden ? 10 : 8;
  const delayMs = document.hidden ? 700 : 500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(attempt === 0 ? (document.hidden ? 1200 : 700) : delayMs);

    if (isStopButtonActive() || isMessageStreaming(provider)) {
      reportDebug('content_submit_verified_streaming', { attempt }, debugContext);
      return true;
    }

    const liveComposer = getComposerElement(provider) ?? composer;

    if (prompt && pageHasSubmittedPrompt(provider, prompt, baselineText)) {
      reportDebug(
        'content_submit_verified_rendered_prompt',
        {
          attempt,
          composerTextLength: getComposerText(provider, liveComposer).length,
          snapshot: getCaptureSnapshot(provider),
        },
        debugContext,
      );
      return true;
    }

    const composerText = getComposerText(provider, liveComposer);
    const threshold = Math.min(80, Math.max(20, Math.floor(promptLength * 0.15)));
    if (composerText.length <= threshold) {
      reportDebug(
        'content_submit_verified_composer_cleared',
        { attempt, composerTextLength: composerText.length, threshold },
        debugContext,
      );
      return true;
    }
  }

  return false;
}

async function submitWithKeyboard(provider, promptLength, composer = null, prompt = '', baselineText = '', debugContext = {}) {
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
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
      return true;
    }
  }

  return false;
}

async function submitMessage(provider, promptLength = 0, composer = null, debugContext = {}, prompt = '', baselineText = '') {
  const targetComposer = composer ?? getComposerElement(provider);
  const form = getComposerForm(targetComposer);
  const immediateButton = findSendButton(provider, false);
  reportDebug(
    'content_submit_started',
    {
      promptLength,
      composerTextLength: getComposerText(provider, targetComposer).length,
      hasForm: Boolean(form),
      sendButtons: getSendButtonSnapshot(provider),
    },
    debugContext,
  );

  if (immediateButton instanceof HTMLElement && !isDisabledForClick(immediateButton)) {
    clickElement(immediateButton);
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
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
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
      return;
    }
  }

  if (await submitWithKeyboard(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
    return;
  }

  let button;
  try {
    button = await waitForEnabledSendButton(provider);
  } catch (error) {
    const parseableResponse = getParseableResponseText(provider, baselineText);
    if (isStopButtonActive() || isMessageStreaming(provider) || parseableResponse) {
      reportDebug(
        'content_submit_late_evidence_after_disabled_wait',
        {
          error: error instanceof Error ? error.message : String(error),
          hasParseableResponse: Boolean(parseableResponse),
          composerTextLength: getComposerText(provider, targetComposer).length,
          snapshot: getCaptureSnapshot(provider),
        },
        debugContext,
      );
      return;
    }

    reportDebug(
      'content_submit_wait_enabled_failed',
      {
        error: error instanceof Error ? error.message : String(error),
        composerTextLength: getComposerText(provider, targetComposer).length,
        sendButtons: getSendButtonSnapshot(provider),
        snapshot: getCaptureSnapshot(provider),
      },
      debugContext,
    );
    throw error;
  }
  if (!isDisabledForClick(button)) {
    clickElement(button);
    if (await verifyMessageSubmitted(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
      return;
    }
  }

  if (await submitWithKeyboard(provider, promptLength, targetComposer, prompt, baselineText, debugContext)) {
    return;
  }

  reportDebug(
    'content_submit_failed',
    {
      composerTextLength: getComposerText(provider, targetComposer).length,
      sendButtons: getSendButtonSnapshot(provider),
      snapshot: getCaptureSnapshot(provider),
    },
    debugContext,
  );

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
  appRequestId,
  appTabId,
}) {
  const debugContext = { appRequestId, appTabId };
  reportDebug(
    'content_capture_invoked',
    {
      provider,
      filename: filename ?? null,
      skipAttach,
      hasPdf: Boolean(pdfBase64),
      promptLength: prompt?.length ?? 0,
      bridgeVersion: 3,
    },
    debugContext,
  );

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
  reportDebug(
    'content_baseline_captured',
    {
      baselineLength: baselineText.length,
      snapshot: getCaptureSnapshot(provider),
    },
    debugContext,
  );

  if (!skipAttach) {
    reportProgress('attaching_pdf', 'Attaching source file…');
    const bytes = Uint8Array.from(atob(pdfBase64), (char) => char.charCodeAt(0));
    const file = new File([bytes], filename, { type: mimeTypeForFilename(filename) });
    await attachFile(file, provider, debugContext);
    await sleep(1500);
    reportProgress('pdf_attached', 'Source file attached');
    reportDebug('content_pdf_attached', { filename, bytes: bytes.length }, debugContext);
  } else {
    reportProgress('improvement_sent', 'Sending improvement prompt…');
  }

  reportProgress('pasting_prompt', 'Pasting edit instruction…');
  const composer = await setPrompt(prompt, provider);
  await waitForPromptInsertion(provider, prompt, composer);
  await sleep(document.hidden ? 1200 : 400);
  reportProgress('prompt_ready', 'Edit instruction ready');

  reportProgress('sending', `Sending to ${provider}…`);
  await submitMessage(provider, prompt.length, composer, debugContext, prompt, baselineText);
  reportProgress('sent', 'Prompt sent — generating response…');
  reportProgress('waiting', document.hidden
    ? 'Provider tab is in the background — waiting for generation to start…'
    : 'Waiting for model to start generating…');
  reportDebug('content_prompt_submitted', getCaptureSnapshot(provider), debugContext);

  const rawResponse = await waitForAssistantResponse(provider, baselineText, 360000, debugContext);
  const metadata = getChatMetadata(provider);
  reportProgress('response_detected', 'Response detected');
  reportDebug(
    'content_capture_success',
    { rawLength: rawResponse.length, chatUrl: metadata.chatUrl },
    debugContext,
  );

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

    if (message.asyncCapture) {
      sendAndCaptureResponse(message)
        .then((response) =>
          chrome.runtime.sendMessage({
            type: 'LLM_CAPTURE_RESULT',
            appRequestId: message.appRequestId,
            appTabId: message.appTabId,
            provider: message.provider,
            sessionId: message.sessionId,
            response,
          }),
        )
        .catch((error) =>
          {
            reportDebug(
              'content_capture_error',
              { error: error instanceof Error ? error.message : 'Injection failed.' },
              { appRequestId: message.appRequestId, appTabId: message.appTabId },
            );
            return chrome.runtime.sendMessage({
              type: 'LLM_CAPTURE_RESULT',
              appRequestId: message.appRequestId,
              appTabId: message.appTabId,
              provider: message.provider,
              sessionId: message.sessionId,
              response: {
                ok: false,
                error: error instanceof Error ? error.message : 'Injection failed.',
              },
            });
          },
        );

      sendResponse({ ok: true, async: true });
      return true;
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
