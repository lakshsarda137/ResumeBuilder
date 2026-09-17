const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const net = require('net');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');

const DATA_DIR = path.join(os.homedir(), '.resume-builder');
const DB_PATH = path.join(DATA_DIR, 'data.db');

const fs = require('fs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS repo_items (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL DEFAULT 'experience',
    title      TEXT NOT NULL,
    company    TEXT,
    position   TEXT,
    start_date TEXT,
    end_date   TEXT,
    mode       TEXT NOT NULL DEFAULT 'optimized',
    content    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS education_items (
    id         TEXT PRIMARY KEY,
    school     TEXT NOT NULL,
    degree     TEXT,
    major      TEXT,
    grad_date  TEXT,
    gpa        TEXT,
    location   TEXT,
    coursework TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS education_meta (
    id          TEXT PRIMARY KEY DEFAULT 'default',
    skills_note TEXT NOT NULL DEFAULT '',
    other_notes TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resume_versions (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    data        TEXT NOT NULL,
    changes     TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS history_sessions (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    snapshot    TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
`);

// Optional project/experience links (added later): hyperlinked on the resume
// as "Title | GitHub | Website" with per-item editable labels.
for (const col of ['github_url', 'github_label', 'website_url', 'website_label']) {
  const has = db.prepare("SELECT 1 FROM pragma_table_info('repo_items') WHERE name = ?").get(col);
  if (!has) db.exec(`ALTER TABLE repo_items ADD COLUMN ${col} TEXT`);
}

// Education start date (added later): the resume must always show the school as a
// "Mon YYYY – Mon YYYY" range, so the enrolment date is stored alongside graduation.
{
  const has = db.prepare("SELECT 1 FROM pragma_table_info('education_items') WHERE name = ?").get('start_date');
  if (!has) db.exec('ALTER TABLE education_items ADD COLUMN start_date TEXT');
}


db.prepare(`INSERT OR IGNORE INTO education_meta (id) VALUES ('default')`).run();

const app = express();
app.use(express.json({ limit: '25mb' }));

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'google-chrome-stable',
    'google-chrome',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function safePdfFilename(filename) {
  const safe = String(filename || 'resume.pdf')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  const base = safe.replace(/^\.pdf$/i, '').trim() || 'resume';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChrome(port, chromeProcess, stderrLines) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(
        stderrLines.join('').trim() || `Chrome exited with code ${chromeProcess.exitCode}.`,
      );
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }

    await sleep(100);
  }

  throw new Error('Timed out while starting the local Chrome PDF renderer.');
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') {
      reject(new Error('This Node.js runtime does not provide WebSocket for PDF rendering.'));
      return;
    }

    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('Could not connect to Chrome PDF renderer.')), {
      once: true,
    });
  });
}

function sendCdp(ws, method, params = {}, timeoutMs = 15_000) {
  if (!ws.__resumeBuilderCdpId) ws.__resumeBuilderCdpId = 0;
  ws.__resumeBuilderCdpId += 1;
  const id = ws.__resumeBuilderCdpId;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error(`Timed out while running Chrome PDF command: ${method}.`));
    }, timeoutMs);

    function onMessage(event) {
      const raw = typeof event.data === 'string' ? event.data : event.data.toString();
      const message = JSON.parse(raw);
      if (message.id !== id) return;

      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      if (message.error) {
        reject(new Error(message.error.message || `Chrome PDF command failed: ${method}.`));
      } else {
        resolve(message.result);
      }
    }

    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function printHtmlWithChrome(chrome, htmlPath, userDataDir) {
  const port = await getFreePort();
  const stderrLines = [];
  const chromeProcess = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );

  chromeProcess.stderr.on('data', (chunk) => {
    stderrLines.push(chunk.toString());
  });

  let ws;
  try {
    await waitForChrome(port, chromeProcess, stderrLines);

    const fileUrl = pathToFileURL(htmlPath).href;
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(fileUrl)}`,
      { method: 'PUT' },
    );
    if (!targetResponse.ok) {
      throw new Error(`Chrome refused to open the resume page (${targetResponse.status}).`);
    }

    const target = await targetResponse.json();
    if (!target.webSocketDebuggerUrl) {
      throw new Error('Chrome did not return a PDF render target.');
    }

    ws = await openWebSocket(target.webSocketDebuggerUrl);
    await sendCdp(ws, 'Page.enable');
    await sendCdp(
      ws,
      'Runtime.evaluate',
      {
        awaitPromise: true,
        expression:
          '(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return document.readyState; })()',
      },
      20_000,
    );

    const result = await sendCdp(
      ws,
      'Page.printToPDF',
      {
        printBackground: true,
        preferCSSPageSize: true,
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,
      },
      30_000,
    );

    return Buffer.from(result.data, 'base64');
  } finally {
    if (ws) ws.close();
    if (chromeProcess.exitCode === null) {
      chromeProcess.kill('SIGTERM');
    }
  }
}

/* ── PDF EXTRACTION ─────────────────────────────────────────────────────── */

app.post('/api/resume/pdf', async (req, res) => {
  const { html, filename } = req.body ?? {};
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'html required' });
  }
  if (!html.includes('resume-page')) {
    return res.status(400).json({ error: 'Resume page markup required.' });
  }

  const chrome = findChromeExecutable();
  if (!chrome) {
    return res.status(503).json({
      error: 'No local Chrome/Chromium executable was found for PDF rendering. Set CHROME_PATH or install Chrome.',
    });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-render-'));
  const htmlPath = path.join(tempDir, 'resume.html');
  const userDataDir = path.join(tempDir, 'chrome-profile');

  try {
    fs.writeFileSync(htmlPath, html, 'utf8');

    const pdf = await printHtmlWithChrome(chrome, htmlPath, userDataDir);
    if (pdf.subarray(0, 4).toString('utf8') !== '%PDF') {
      return res.status(500).json({ error: 'Chrome generated an invalid PDF.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safePdfFilename(filename)}"`);
    return res.send(pdf);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'PDF rendering failed.' });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

app.post('/api/pdf/markdown', (req, res) => {
  const { base64, filename } = req.body ?? {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 PDF required' });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-pdf-'));
  const safeName = (filename || 'resume.pdf').replace(/[^a-z0-9._-]/gi, '_');
  const pdfPath = path.join(tempDir, safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`);

  try {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0 || buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
      return res.status(400).json({ error: 'Uploaded file is not a valid PDF.' });
    }

    fs.writeFileSync(pdfPath, buffer);

    const scriptPath = path.join(__dirname, 'pdf_to_markdown.py');
    const result = spawnSync('python3', [scriptPath, pdfPath], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });

    const raw = result.stdout.trim();
    const parsed = raw ? JSON.parse(raw) : null;
    if (result.status !== 0 || !parsed?.ok) {
      const detail = parsed?.error || result.stderr.trim() || 'PDF text extraction failed.';
      return res.status(422).json({ error: detail });
    }

    return res.json({
      markdown: parsed.markdown,
      engine: parsed.engine,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'PDF text extraction failed.' });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

app.post('/api/docx/text', (req, res) => {
  const { base64, filename } = req.body ?? {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'base64 docx required' });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-docx-'));
  const safeName = (filename || 'document.docx').replace(/[^a-z0-9._-]/gi, '_');
  const docxPath = path.join(
    tempDir,
    safeName.toLowerCase().endsWith('.docx') ? safeName : `${safeName}.docx`,
  );

  try {
    const buffer = Buffer.from(base64, 'base64');
    // .docx is a ZIP archive, so it must start with the "PK" local-file header.
    if (buffer.length === 0 || buffer.subarray(0, 2).toString('utf8') !== 'PK') {
      return res.status(400).json({ error: 'Uploaded file is not a valid .docx file.' });
    }

    fs.writeFileSync(docxPath, buffer);

    const scriptPath = path.join(__dirname, 'docx_to_text.py');
    const result = spawnSync('python3', [scriptPath, docxPath], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });

    const raw = result.stdout.trim();
    const parsed = raw ? JSON.parse(raw) : null;
    if (result.status !== 0 || !parsed?.ok) {
      const detail = parsed?.error || result.stderr.trim() || 'DOCX text extraction failed.';
      return res.status(422).json({ error: detail });
    }

    return res.json({ text: parsed.text });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'DOCX text extraction failed.' });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// Write an attachment to a temp file and return its ABSOLUTE path. Needed for
// the Gemini CDP file-chooser attach: chrome.debugger's DOM.setFileInputFiles
// reads files from disk by absolute path (the Puppeteer mechanism), and the
// extension service worker cannot write to disk itself. The file is cleaned up
// after a TTL so paths don't accumulate.
const GEMINI_ATTACH_DIR = path.join(os.tmpdir(), 'resume-gemini-attach');
const GEMINI_ATTACH_TTL_MS = 10 * 60 * 1000;

/* ── LATEX PDF ──────────────────────────────────────────────────────────── */

const LATEX_BUILD_DIR = path.join(DATA_DIR, 'latex-build');

function findTectonic() {
  const candidates = [
    process.env.TECTONIC_PATH,
    '/opt/homebrew/bin/tectonic',
    '/usr/local/bin/tectonic',
    'tectonic',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', stdio: 'ignore' });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

/**
 * Compile a LaTeX source string to PDF with Tectonic. The .tex is written to a
 * fresh temp dir so concurrent downloads never collide; the dir is removed
 * after the response. Page count comes from the engine log, which is the only
 * reliable source once the PDF's object streams are compressed.
 */
app.post('/api/latex/pdf', (req, res) => {
  const { tex, filename } = req.body ?? {};
  if (typeof tex !== 'string' || !tex.trim()) {
    return res.status(400).json({ error: 'tex required' });
  }
  const tectonic = findTectonic();
  if (!tectonic) {
    return res.status(503).json({
      error:
        'Tectonic (LaTeX engine) is not installed. Install it with `brew install tectonic`, then restart the API server.',
    });
  }

  fs.mkdirSync(LATEX_BUILD_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(LATEX_BUILD_DIR, 'b-'));
  const texPath = path.join(dir, 'resume.tex');
  fs.writeFileSync(texPath, tex, 'utf8');

  try {
    const result = spawnSync(
      tectonic,
      ['-X', 'compile', '--keep-logs', '--outdir', dir, texPath],
      { encoding: 'utf8', timeout: 120_000 },
    );
    const log = (() => {
      try {
        return fs.readFileSync(path.join(dir, 'resume.log'), 'utf8');
      } catch {
        return '';
      }
    })();
    const pdfPath = path.join(dir, 'resume.pdf');
    if (result.status !== 0 || !fs.existsSync(pdfPath)) {
      // Surface the first real TeX error line, which is what the user needs
      // to fix the source in Overleaf, rather than the whole log.
      const errorLine =
        log.split('\n').find((line) => line.startsWith('!')) ||
        (result.stderr || '').split('\n').find((line) => line.trim()) ||
        'LaTeX compile failed.';
      return res.status(422).json({ error: errorLine.trim(), log: log.slice(-6000) });
    }
    const pageMatch = log.match(/Output written on [^(]*\((\d+) pages?/);
    const pages = pageMatch ? Number(pageMatch[1]) : null;
    const pdf = fs.readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safePdfFilename(filename)}"`);
    res.setHeader('X-Page-Count', pages == null ? '' : String(pages));
    res.setHeader('Access-Control-Expose-Headers', 'X-Page-Count');
    res.send(pdf);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

app.post('/api/tmpfile', (req, res) => {
  const { base64, text, filename } = req.body ?? {};
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename required' });
  }
  if (typeof base64 !== 'string' && typeof text !== 'string') {
    return res.status(400).json({ error: 'base64 or text required' });
  }

  try {
    fs.mkdirSync(GEMINI_ATTACH_DIR, { recursive: true });
    // Unique subdir so concurrent bulk jobs never collide on the same name.
    const dir = fs.mkdtempSync(path.join(GEMINI_ATTACH_DIR, 'f-'));
    const safeName = filename.replace(/[^a-z0-9._-]/gi, '_') || 'attachment.txt';
    const filePath = path.join(dir, safeName);
    const buffer =
      typeof base64 === 'string'
        ? Buffer.from(base64, 'base64')
        : Buffer.from(text, 'utf8');
    fs.writeFileSync(filePath, buffer);

    const timer = setTimeout(() => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* already gone */
      }
    }, GEMINI_ATTACH_TTL_MS);
    if (typeof timer.unref === 'function') timer.unref();

    return res.json({ path: filePath });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to write temp file.' });
  }
});

/* ── REPOSITORY ─────────────────────────────────────────────────────────── */

app.get('/api/repo', (_req, res) => {
  const rows = db.prepare('SELECT * FROM repo_items ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/repo', (req, res) => {
  const { type, title, company, position, start_date, end_date, mode, content,
    github_url, github_label, website_url, website_label } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const id = nowId();
  db.prepare(`
    INSERT INTO repo_items (id, type, title, company, position, start_date, end_date, mode, content,
      github_url, github_label, website_url, website_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type ?? 'experience', title.trim(), company ?? null, position ?? null,
    start_date ?? null, end_date ?? null, mode ?? 'optimized', content ?? '',
    github_url || null, github_label || null, website_url || null, website_label || null);
  res.json(db.prepare('SELECT * FROM repo_items WHERE id = ?').get(id));
});

app.delete('/api/repo', (_req, res) => {
  db.prepare('DELETE FROM repo_items').run();
  res.json({ ok: true });
});

app.patch('/api/repo/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM repo_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const fields = ['type','title','company','position','start_date','end_date','mode','content',
    'github_url','github_label','website_url','website_label'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (Object.keys(updates).length === 0) return res.json(item);
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), new Date().toISOString(), req.params.id];
  db.prepare(`UPDATE repo_items SET ${setClauses}, updated_at = ? WHERE id = ?`).run(...values);
  res.json(db.prepare('SELECT * FROM repo_items WHERE id = ?').get(req.params.id));
});

app.delete('/api/repo/:id', (req, res) => {
  db.prepare('DELETE FROM repo_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ── EDUCATION ───────────────────────────────────────────────────────────── */

app.get('/api/education', (_req, res) => {
  const items = db.prepare('SELECT * FROM education_items ORDER BY grad_date DESC, created_at DESC').all();
  const meta = db.prepare('SELECT skills_note, other_notes, updated_at FROM education_meta WHERE id = ?').get('default')
    ?? { skills_note: '', other_notes: '', updated_at: null };
  res.json({ items, meta });
});

app.post('/api/education', (req, res) => {
  const { school, degree, major, start_date, grad_date, gpa, location, coursework } = req.body;
  if (!school?.trim()) return res.status(400).json({ error: 'school required' });
  const id = nowId();
  db.prepare(`
    INSERT INTO education_items (id, school, degree, major, start_date, grad_date, gpa, location, coursework)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    school.trim(),
    degree ?? null,
    major ?? null,
    start_date ?? null,
    grad_date ?? null,
    gpa ?? null,
    location ?? null,
    coursework ?? '',
  );
  res.json(db.prepare('SELECT * FROM education_items WHERE id = ?').get(id));
});

app.delete('/api/education', (_req, res) => {
  db.prepare('DELETE FROM education_items').run();
  db.prepare(`
    UPDATE education_meta
    SET skills_note = '', other_notes = '', updated_at = ?
    WHERE id = 'default'
  `).run(new Date().toISOString());
  res.json({ ok: true });
});

app.patch('/api/education/meta', (req, res) => {
  const row = db.prepare('SELECT * FROM education_meta WHERE id = ?').get('default');
  if (!row) return res.status(404).json({ error: 'not found' });
  const fields = ['skills_note', 'other_notes'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (Object.keys(updates).length === 0) return res.json(row);
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE education_meta SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .run(...Object.values(updates), new Date().toISOString(), 'default');
  res.json(db.prepare('SELECT skills_note, other_notes, updated_at FROM education_meta WHERE id = ?').get('default'));
});

app.patch('/api/education/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM education_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const fields = ['school', 'degree', 'major', 'start_date', 'grad_date', 'gpa', 'location', 'coursework'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (Object.keys(updates).length === 0) return res.json(item);
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE education_items SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .run(...Object.values(updates), new Date().toISOString(), req.params.id);
  res.json(db.prepare('SELECT * FROM education_items WHERE id = ?').get(req.params.id));
});

app.delete('/api/education/:id', (req, res) => {
  db.prepare('DELETE FROM education_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ── RESUME VERSIONS ─────────────────────────────────────────────────────── */

app.get('/api/versions', (_req, res) => {
  const rows = db.prepare('SELECT * FROM resume_versions ORDER BY created_at ASC').all();
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data), changes: JSON.parse(r.changes) })));
});

app.post('/api/versions', (req, res) => {
  const { label, data, changes } = req.body;
  if (!label || !data) return res.status(400).json({ error: 'label and data required' });
  const id = nowId();
  db.prepare('INSERT INTO resume_versions (id, label, data, changes) VALUES (?, ?, ?, ?)')
    .run(id, label, JSON.stringify(data), JSON.stringify(changes ?? []));
  res.json({ id, label, data, changes: changes ?? [], created_at: new Date().toISOString() });
});

app.delete('/api/versions/:id', (req, res) => {
  db.prepare('DELETE FROM resume_versions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ── HISTORY SESSIONS ────────────────────────────────────────────────────── */

app.get('/api/history', (_req, res) => {
  const rows = db
    .prepare('SELECT id, title, created_at, updated_at FROM history_sessions ORDER BY updated_at DESC')
    .all();
  res.json(rows);
});

app.delete('/api/history', (_req, res) => {
  db.prepare('DELETE FROM history_sessions').run();
  res.json({ ok: true });
});

app.get('/api/history/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM history_sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    snapshot: JSON.parse(row.snapshot),
  });
});

app.post('/api/history', (req, res) => {
  const { title, snapshot } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  if (!snapshot) return res.status(400).json({ error: 'snapshot required' });
  const id = nowId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO history_sessions (id, title, snapshot, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title.trim(), JSON.stringify(snapshot), now, now);
  res.json({
    id,
    title: title.trim(),
    created_at: now,
    updated_at: now,
    snapshot,
  });
});

app.put('/api/history/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM history_sessions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const { snapshot, title } = req.body;
  if (!snapshot) return res.status(400).json({ error: 'snapshot required' });
  const now = new Date().toISOString();
  const nextTitle = title?.trim() ? title.trim() : row.title;
  db.prepare('UPDATE history_sessions SET title = ?, snapshot = ?, updated_at = ? WHERE id = ?')
    .run(nextTitle, JSON.stringify(snapshot), now, req.params.id);
  res.json({
    id: row.id,
    title: nextTitle,
    created_at: row.created_at,
    updated_at: now,
    snapshot,
  });
});

app.delete('/api/history/:id', (req, res) => {
  db.prepare('DELETE FROM history_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`Resume Builder API on http://localhost:${PORT}`));
