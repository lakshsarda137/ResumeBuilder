let pdfData = null;

const fileZone = document.getElementById('file-zone');
const fileInput = document.getElementById('pdf-input');
const fileLabel = document.getElementById('file-label');
const clearBtn = document.getElementById('clear-file');
const launchBtn = document.getElementById('launch');
const statusEl = document.getElementById('status');

fileZone.addEventListener('dragover', (e) => { e.preventDefault(); fileZone.classList.add('drag-over'); });
fileZone.addEventListener('dragleave', () => fileZone.classList.remove('drag-over'));
fileZone.addEventListener('drop', (e) => {
  e.preventDefault();
  fileZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

clearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pdfData = null;
  fileInput.value = '';
  fileLabel.textContent = 'Click or drag a PDF here';
  fileZone.classList.remove('has-file');
  clearBtn.hidden = true;
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    pdfData = { name: file.name, base64, mimeType: file.type || 'application/pdf' };
    fileLabel.textContent = file.name;
    fileZone.classList.add('has-file');
    clearBtn.hidden = false;
  };
  reader.readAsDataURL(file);
}

async function convertPdfToMarkdown(pdf) {
  const body = JSON.stringify({ base64: pdf.base64, filename: pdf.name });
  let response;

  for (const baseUrl of ['http://localhost:3001', 'http://127.0.0.1:3001']) {
    try {
      response = await fetch(`${baseUrl}/api/pdf/markdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      break;
    } catch {
      // Try the next loopback host.
    }
  }

  if (!response) {
    throw new Error('Could not reach the local Resume Builder API for PDF conversion.');
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Could not convert PDF to markdown.');
  }

  if (!result.markdown?.trim()) {
    throw new Error('PDF conversion returned no text.');
  }

  return {
    ...pdf,
    markdown: result.markdown,
    markdownEngine: result.engine,
  };
}

launchBtn.addEventListener('click', async () => {
  const provider = document.getElementById('provider').value;
  const prompt = document.getElementById('prompt').value.trim();

  if (!prompt && !pdfData) {
    statusEl.textContent = 'Enter a prompt or attach a PDF.';
    statusEl.className = 'error';
    return;
  }

  statusEl.textContent = 'Working...';
  statusEl.className = '';
  launchBtn.disabled = true;

  let pdfForLaunch = pdfData;

  try {
    if (provider === 'gemini' && pdfForLaunch && !pdfForLaunch.markdown) {
      statusEl.textContent = 'Converting PDF to markdown for Gemini...';
      pdfForLaunch = await convertPdfToMarkdown(pdfForLaunch);
      pdfData = pdfForLaunch;
    }
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.className = 'error';
    launchBtn.disabled = false;
    return;
  }

  statusEl.textContent = 'Working...';

  const jobId = Date.now().toString();

  chrome.runtime.sendMessage({ type: 'LAUNCH', provider, prompt, pdf: pdfForLaunch, jobId });

  chrome.runtime.onMessage.addListener(function handler(msg) {
    if (msg.type !== 'llm-launcher-done' || msg.jobId !== jobId) return;
    chrome.runtime.onMessage.removeListener(handler);

    if (msg.error) {
      statusEl.textContent = 'Error: ' + msg.error;
      statusEl.className = 'error';
      launchBtn.disabled = false;
    } else if (msg.warning) {
      statusEl.textContent = msg.warning;
      statusEl.className = 'warning';
      launchBtn.disabled = false;
    } else if (msg.note) {
      statusEl.textContent = msg.note;
      statusEl.className = 'done';
      launchBtn.disabled = false;
    } else {
      statusEl.textContent = 'Done!';
      statusEl.className = 'done';
      launchBtn.disabled = false;
    }
  });
});

chrome.storage.local.get('lastProvider', ({ lastProvider }) => {
  if (lastProvider) document.getElementById('provider').value = lastProvider;
});

document.getElementById('provider').addEventListener('change', (e) => {
  chrome.storage.local.set({ lastProvider: e.target.value });
});
