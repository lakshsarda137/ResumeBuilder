function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectVisibleText(root) {
  const blocks = [];
  const selectors = ['main', '[role="main"]', 'article', 'section'];
  for (const selector of selectors) {
    root.querySelectorAll(selector).forEach((node) => {
      if (!isVisible(node)) return;
      const text = node.innerText?.trim();
      if (text && text.length > 80) blocks.push(text);
    });
  }

  if (blocks.length > 0) {
    return blocks.join('\n\n').slice(0, 60_000);
  }

  return (root.body?.innerText ?? '').trim().slice(0, 60_000);
}

if (!globalThis.__resumeBuilderScrapeBridge) {
  globalThis.__resumeBuilderScrapeBridge = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'SCRAPE_PAGE') {
      return false;
    }

    try {
      const text = collectVisibleText(document);
      if (!text || text.length < 80) {
        sendResponse({
          ok: false,
          error:
            'Could not read enough text on this page. Make sure you are logged in and the profile is fully loaded.',
        });
        return true;
      }

      sendResponse({
        ok: true,
        text,
        url: location.href,
        title: document.title,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Scrape failed.',
      });
    }

    return true;
  });
}
