// Persistent content script — injected into LLM provider tabs

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'INJECT') {
    (async () => {
      try {
        const result = await injectAll(message.provider, message.prompt, message.pdf);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // keep channel open for async response
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clickElement(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
  if (typeof el.click === 'function') el.click();
}

function isUsable(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (document.hidden) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findVisibleElement(selectors, root = document) {
  for (const sel of selectors) {
    for (const node of root.querySelectorAll(sel)) {
      if (isUsable(node)) return node;
    }
  }
  return null;
}

function findElementByText(patterns, root = document) {
  const candidates = root.querySelectorAll('button, [role="menuitem"], [role="option"], a');
  for (const node of candidates) {
    const text = node.textContent?.trim() ?? '';
    for (const pattern of patterns) {
      const matches = typeof pattern === 'string'
        ? text === pattern || text.includes(pattern)
        : pattern.test(text);
      if (matches && isUsable(node))
        return node.closest('button, [role="menuitem"], [role="option"], a') ?? node;
    }
  }
  return null;
}

async function waitForElement(getFn, { attempts = 12, delayMs = 500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const el = getFn();
    if (el) return el;
    await sleep(delayMs);
  }
  return null;
}

function base64ToFile(base64, name, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mimeType });
}

function attachFileToInput(input, file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function pasteIntoContentEditable(el, text) {
  el.focus();
  document.execCommand('selectAll');
  document.execCommand('insertText', false, text);
  if (el.textContent.trim() !== text.trim()) {
    const p = el.querySelector('p') || el;
    p.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

function buildPromptWithPdfMarkdown(prompt, pdf) {
  const safeMarkdown = pdf.markdown.replace(/```/g, '`\u200b``');
  const parts = [];

  if (prompt) parts.push(prompt);

  parts.push([
    `Attached PDF converted to markdown: ${pdf.name}`,
    '',
    'Use the markdown below as the content of the attached PDF.',
    '',
    '```markdown',
    safeMarkdown,
    '```',
  ].join('\n'));

  return parts.join('\n\n');
}

// ─── Providers ───────────────────────────────────────────────────────────────

async function injectAll(provider, prompt, pdf) {
  const runners = { claude: runClaude, chatgpt: runChatGPT, gemini: runGemini };
  const run = runners[provider];
  if (!run) throw new Error(`Unknown provider: ${provider}`);
  return await run(prompt, pdf);
}

async function runClaude(prompt, pdf) {
  const MAX_WAIT = { attempts: 24, delayMs: 500 };

  const promptInput = await waitForElement(
    () => document.querySelector('[data-testid="chat-input"]'),
    MAX_WAIT
  );
  if (!promptInput) throw new Error('Prompt input not found on Claude');

  if (pdf) {
    const attachBtn = await waitForElement(
      () => findVisibleElement(['[aria-label="Add files, connectors, and more"]']),
      MAX_WAIT
    );
    if (!attachBtn) throw new Error('Attach button not found on Claude');

    clickElement(attachBtn);

    const fileInput = await waitForElement(
      () => document.querySelector('input[type="file"]'),
      { attempts: 15, delayMs: 200 }
    );
    if (!fileInput) throw new Error('File input not found on Claude');

    attachFileToInput(fileInput, base64ToFile(pdf.base64, pdf.name, pdf.mimeType));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(600);
  }

  if (prompt) pasteIntoContentEditable(promptInput, prompt);
}

async function runChatGPT(prompt, pdf) {
  const MAX_WAIT = { attempts: 24, delayMs: 500 };

  const promptInput = await waitForElement(
    () => document.querySelector('#prompt-textarea'),
    MAX_WAIT
  );
  if (!promptInput) throw new Error('Prompt input not found on ChatGPT');

  if (pdf) {
    const fileInput = await waitForElement(
      () => document.querySelector('#upload-files'),
      MAX_WAIT
    );
    if (!fileInput) throw new Error('File input not found on ChatGPT');

    attachFileToInput(fileInput, base64ToFile(pdf.base64, pdf.name, pdf.mimeType));
    await sleep(800);
  }

  if (prompt) pasteIntoContentEditable(promptInput, prompt);
}

async function runGemini(prompt, pdf) {
  const MAX_WAIT = { attempts: 24, delayMs: 500 };

  const promptInput = await waitForElement(
    () => findVisibleElement(['.ql-editor[aria-label="Enter a prompt for Gemini"]', '.ql-editor']),
    MAX_WAIT
  );
  if (!promptInput) throw new Error('Prompt input not found on Gemini');

  if (pdf?.markdown) {
    pasteIntoContentEditable(promptInput, buildPromptWithPdfMarkdown(prompt, pdf));
    return {
      note: 'Done! Gemini prompt includes the converted PDF markdown.',
    };
  }

  if (prompt) pasteIntoContentEditable(promptInput, prompt);

  if (pdf) {
    if (document.hidden) {
      return {
        warning:
          'Prompt pasted. Gemini does not expose its PDF file input in a background tab, so the PDF was not attached.',
      };
    }

    const menuButton = await waitForElement(() =>
      findVisibleElement([
        'gem-icon-button[aria-label="Upload & tools"]',
        'button[aria-label="Upload & tools"]',
        '[aria-label="Upload & tools"]',
        'button[aria-label*="upload file menu" i]',
        'button[aria-label*="Upload" i]',
      ]),
      MAX_WAIT
    );
    if (!menuButton) throw new Error('Upload button not found on Gemini');

    clickElement(menuButton);
    await sleep(700);

    const uploadItem = await waitForElement(
      () => findElementByText([/^Upload files$/i, /^Files$/i, /Upload from computer/i, /Upload file/i]),
      { attempts: 10, delayMs: 400 }
    );
    if (uploadItem) {
      clickElement(uploadItem);
      await sleep(600);
    }

    const fileInput = await waitForElement(
      () => findVisibleElement(['input[type="file"]', 'input[accept*="pdf" i]']) ?? document.querySelector('input[type="file"]'),
      { attempts: 12, delayMs: 400 }
    );
    if (!fileInput) {
      return {
        warning:
          'Prompt pasted. Gemini opened without a usable PDF file input, so the PDF was not attached.',
      };
    }

    attachFileToInput(fileInput, base64ToFile(pdf.base64, pdf.name, pdf.mimeType));
    await sleep(2000);
  }
}
