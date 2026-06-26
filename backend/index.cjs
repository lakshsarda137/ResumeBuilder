const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

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

  CREATE TABLE IF NOT EXISTS ongoing_items (
    id         TEXT PRIMARY KEY,
    type       TEXT NOT NULL DEFAULT 'experience',
    title      TEXT NOT NULL,
    company    TEXT,
    position   TEXT,
    start_date TEXT,
    status     TEXT NOT NULL DEFAULT 'active',
    end_date   TEXT,
    compiled   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reflections (
    id              TEXT PRIMARY KEY,
    ongoing_item_id TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (ongoing_item_id) REFERENCES ongoing_items(id) ON DELETE CASCADE
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

db.prepare(`INSERT OR IGNORE INTO education_meta (id) VALUES ('default')`).run();

const app = express();
app.use(express.json({ limit: '25mb' }));

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ── PDF EXTRACTION ─────────────────────────────────────────────────────── */

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

/* ── REPOSITORY ─────────────────────────────────────────────────────────── */

app.get('/api/repo', (_req, res) => {
  const rows = db.prepare('SELECT * FROM repo_items ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/api/repo', (req, res) => {
  const { type, title, company, position, start_date, end_date, mode, content } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const id = nowId();
  db.prepare(`
    INSERT INTO repo_items (id, type, title, company, position, start_date, end_date, mode, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, type ?? 'experience', title.trim(), company ?? null, position ?? null,
    start_date ?? null, end_date ?? null, mode ?? 'optimized', content ?? '');
  res.json(db.prepare('SELECT * FROM repo_items WHERE id = ?').get(id));
});

app.delete('/api/repo', (_req, res) => {
  db.prepare('DELETE FROM repo_items').run();
  res.json({ ok: true });
});

app.patch('/api/repo/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM repo_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const fields = ['type','title','company','position','start_date','end_date','mode','content'];
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

/* ── ONGOING ─────────────────────────────────────────────────────────────── */

app.get('/api/ongoing', (_req, res) => {
  const items = db.prepare('SELECT * FROM ongoing_items ORDER BY created_at DESC').all();
  const allReflections = db.prepare('SELECT * FROM reflections ORDER BY created_at ASC').all();
  const refMap = {};
  for (const r of allReflections) {
    if (!refMap[r.ongoing_item_id]) refMap[r.ongoing_item_id] = [];
    refMap[r.ongoing_item_id].push(r);
  }
  res.json(items.map(i => ({ ...i, reflections: refMap[i.id] ?? [] })));
});

app.post('/api/ongoing', (req, res) => {
  const { type, title, company, position, start_date } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const id = nowId();
  db.prepare(`
    INSERT INTO ongoing_items (id, type, title, company, position, start_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, type ?? 'experience', title.trim(), company ?? null, position ?? null, start_date ?? null);
  res.json({ ...db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(id), reflections: [] });
});

app.delete('/api/ongoing', (_req, res) => {
  db.prepare('DELETE FROM ongoing_items').run();
  res.json({ ok: true });
});

app.post('/api/ongoing/:id/reflection', (req, res) => {
  const item = db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const id = nowId();
  db.prepare('INSERT INTO reflections (id, ongoing_item_id, content) VALUES (?, ?, ?)').run(id, req.params.id, content.trim());
  db.prepare("UPDATE ongoing_items SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM reflections WHERE id = ?').get(id));
});

app.patch('/api/ongoing/:id/reflection/:rid', (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  db.prepare('UPDATE reflections SET content = ? WHERE id = ? AND ongoing_item_id = ?').run(content.trim(), req.params.rid, req.params.id);
  res.json(db.prepare('SELECT * FROM reflections WHERE id = ?').get(req.params.rid));
});

app.delete('/api/ongoing/:id/reflection/:rid', (req, res) => {
  db.prepare('DELETE FROM reflections WHERE id = ? AND ongoing_item_id = ?').run(req.params.rid, req.params.id);
  res.json({ ok: true });
});

app.patch('/api/ongoing/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const fields = ['type','title','company','position','start_date','end_date','status','compiled'];
  const updates = {};
  for (const f of fields) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (Object.keys(updates).length === 0) return res.json(item);
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE ongoing_items SET ${setClauses}, updated_at = ? WHERE id = ?`).run(...Object.values(updates), new Date().toISOString(), req.params.id);
  res.json(db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(req.params.id));
});

app.post('/api/ongoing/:id/complete', (req, res) => {
  const item = db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  const reflections = db.prepare('SELECT * FROM reflections WHERE ongoing_item_id = ? ORDER BY created_at ASC').all(req.params.id);
  const end_date = req.body.end_date ?? new Date().toISOString().slice(0, 10);
  const compiled = [
    `${item.title}${item.company ? ` at ${item.company}` : ''}${item.position ? ` (${item.position})` : ''}`,
    `${item.start_date ?? 'Unknown start'} – ${end_date}`,
    '',
    ...reflections.map(r => `- ${r.content}`),
  ].join('\n');
  db.prepare("UPDATE ongoing_items SET status = 'done', end_date = ?, compiled = ?, updated_at = datetime('now') WHERE id = ?")
    .run(end_date, compiled, req.params.id);
  res.json(db.prepare('SELECT * FROM ongoing_items WHERE id = ?').get(req.params.id));
});

app.delete('/api/ongoing/:id', (req, res) => {
  db.prepare('DELETE FROM ongoing_items WHERE id = ?').run(req.params.id);
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
  const { school, degree, major, grad_date, gpa, location, coursework } = req.body;
  if (!school?.trim()) return res.status(400).json({ error: 'school required' });
  const id = nowId();
  db.prepare(`
    INSERT INTO education_items (id, school, degree, major, grad_date, gpa, location, coursework)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    school.trim(),
    degree ?? null,
    major ?? null,
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
  const fields = ['school', 'degree', 'major', 'grad_date', 'gpa', 'location', 'coursework'];
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
