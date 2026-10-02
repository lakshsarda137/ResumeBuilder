/**
 * Sync the repository warehouse from a portfolio site's markdown write-ups.
 *
 * The portfolio keeps one file per project, each with the same shape:
 *
 *   # Project Name
 *   *Internship, May – Jul 2026*
 *   <one-line summary>
 *   Links: [View on GitHub](https://...), [Open the site](https://...)
 *   | Field | Value |
 *   | Role | Software Engineer Intern |
 *   ## Why I built it ...
 *
 * Those files are longer and more candid than anything typed into the app by
 * hand, which makes them the better freewrite source: the whole document
 * becomes the item's content, and the header lines supply the fields around it.
 *
 * This lives in the backend rather than the app so the timer can keep the
 * warehouse current while the server runs, with no browser tab open. Items are
 * matched by the filename they came from, so re-running only updates; anything
 * in the repository without a portfolio file is never touched.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

/** Role labels that mean employment. Everything else is a project. */
const EXPERIENCE_LABELS =
  /\b(intern(ship)?|co-?founder|founder|engineer|developer|analyst|assistant|employee|contract|freelance|research)\b/i;

const LINK_LABELS = [
  [/github/i, 'GitHub'],
  [/play/i, 'Play Online'],
  [/chrome|extension/i, 'Chrome Extension'],
  [/site|website|live|demo|open the/i, 'Website'],
];

function expandHome(dir) {
  return dir.startsWith('~') ? path.join(os.homedir(), dir.slice(1)) : dir;
}

function shortLinkLabel(raw) {
  const text = raw.trim();
  for (const [pattern, label] of LINK_LABELS) {
    if (pattern.test(text)) return label;
  }
  return text.replace(/^(view|visit|open|try)\s+(on|the)?\s*/i, '').trim() || 'Website';
}

function normalizeUrl(value) {
  const text = (value ?? '').trim();
  if (!text || /\s/.test(text) || /["'<>]/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(text)) return `https://${text}`;
  return null;
}

/** "May – Jul 2026", "Dec 2025 – Jul 2026", "Jul 2026 – Present". */
function parseDateRange(raw) {
  const parts = String(raw ?? '').split(/\s*(?:–|—|-|to)\s*/i).filter(Boolean);
  if (parts.length === 0) return { start: null, end: null };

  const tail = parts[parts.length - 1].trim();
  const ongoing = /present|ongoing|now/i.test(tail);
  const endYear = (tail.match(/\b(20\d{2})\b/) || [])[1];

  const readPart = (value, fallbackYear) => {
    const match = value.trim().match(/([A-Za-z]{3,9})\.?\s*(\d{4})?/);
    if (!match) return null;
    const key = match[1].toLowerCase();
    const month = MONTHS[key.slice(0, 4)] || MONTHS[key.slice(0, 3)];
    const year = match[2] || fallbackYear;
    if (month && year) return `${year}-${month}`;
    return year ? `${year}-01` : null;
  };

  const end = ongoing ? null : readPart(tail, endYear);
  // "May – Jul 2026": the start has no year of its own, so it borrows the end's.
  const start = parts.length > 1 ? readPart(parts[0], endYear) : end;
  return { start, end };
}

function tableValue(markdown, field) {
  const row = markdown.match(new RegExp(`^\\|\\s*${field}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'im'));
  return row ? row[1].trim() : null;
}

function parseLinks(markdown, portfolioUrl) {
  const line = (markdown.match(/^Links:\s*(.+)$/im) || [])[1] || '';
  const links = [];
  const seen = new Set();
  const push = (label, url) => {
    const href = normalizeUrl(url);
    if (!href || seen.has(href)) return;
    seen.add(href);
    links.push({ label, url: href });
  };
  for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    push(shortLinkLabel(match[1]), match[2]);
  }
  if (portfolioUrl) push('Portfolio', portfolioUrl);
  return links;
}

/** Strip the generator comment and the title; both are carried as fields. */
function bodyContent(markdown) {
  return markdown.replace(/^<!--[\s\S]*?-->\s*/m, '').replace(/^#\s+.+$/m, '').trim();
}

function parsePortfolioFile(slug, markdown, baseUrl) {
  const title = (markdown.match(/^#\s+(.+)$/m) || [])[1];
  if (!title) return null;

  const meta = (markdown.match(/^\*(.+?)\*\s*$/m) || [])[1] || '';
  const commaIndex = meta.lastIndexOf(',');
  const roleLabel = (commaIndex === -1 ? meta : meta.slice(0, commaIndex)).trim();
  const { start, end } = parseDateRange(commaIndex === -1 ? '' : meta.slice(commaIndex + 1));

  const type = EXPERIENCE_LABELS.test(roleLabel) ? 'experience' : 'project';
  const role = tableValue(markdown, 'Role');
  const base = (baseUrl || '').trim().replace(/\/+$/, '');

  return {
    slug,
    type,
    title: title.trim(),
    company: type === 'experience' ? title.trim() : null,
    position: type === 'experience' ? role || roleLabel || null : null,
    start_date: start,
    end_date: end,
    links: parseLinks(markdown, base ? `${base}/${slug}.html` : null),
    content: bodyContent(markdown),
  };
}

function readPortfolioItems(contentDir, baseUrl) {
  const dir = path.resolve(expandHome(contentDir));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`No such folder: ${dir}`);
  }

  const items = [];
  let signature = '';
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.toLowerCase().endsWith('.md') || name.toLowerCase() === 'readme.md') continue;
    const full = path.join(dir, name);
    const markdown = fs.readFileSync(full, 'utf8');
    signature += `${name}:${fs.statSync(full).mtimeMs};`;
    const item = parsePortfolioFile(name.replace(/\.md$/i, ''), markdown, baseUrl);
    if (item) items.push(item);
  }
  return { dir, items, signature };
}

function normalizeTitle(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Meaningful words, so "Peg Solitaire Solver" can match "peg-solitaire". */
function titleWords(value) {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !['the', 'for', 'and', 'with', 'library'].includes(word));
}

function sharesEveryWord(a, b) {
  return a.length > 0 && b.length > 0 && (a.every((w) => b.includes(w)) || b.every((w) => a.includes(w)));
}

/**
 * Does this repository row describe the same work as this portfolio item?
 * Rows typed in by hand often carry the ROLE as the title and the employer in
 * `company`, while the portfolio names the employer, so both are checked.
 */
function isSameWork(row, item) {
  const rowTitle = normalizeTitle(row.title);
  const rowCompany = normalizeTitle(row.company);
  const itemTitle = normalizeTitle(item.title);
  const slug = normalizeTitle(item.slug);

  if (rowTitle === itemTitle || rowCompany === itemTitle) return true;
  if (slug && (rowTitle === slug || rowCompany === slug)) return true;

  const slugWords = titleWords(item.slug);
  return (
    sharesEveryWord(titleWords(item.title), titleWords(row.title)) ||
    sharesEveryWord(slugWords, titleWords(row.title)) ||
    sharesEveryWord(slugWords, titleWords(row.company))
  );
}

/**
 * Write the parsed items into repo_items. Returns what changed; a row whose
 * fields already match is left alone so `updated_at` stays meaningful.
 */
function applyItems(db, items, newId) {
  const rows = db.prepare('SELECT * FROM repo_items').all();
  const created = [];
  const updated = [];
  const claimed = new Set();

  for (const item of items) {
    const match =
      rows.find((row) => row.source_slug === item.slug && !claimed.has(row.id)) ||
      rows.find((row) => !claimed.has(row.id) && isSameWork(row, item));

    const links = JSON.stringify(item.links);

    if (!match) {
      const id = newId();
      db.prepare(`
        INSERT INTO repo_items (id, type, title, company, position, start_date, end_date, mode, content, links, source_slug)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'freewrite', ?, ?, ?)
      `).run(id, item.type, item.title, item.company, item.position,
        item.start_date, item.end_date, item.content, links, item.slug);
      created.push(item.title);
      continue;
    }

    claimed.add(match.id);

    const unchanged =
      match.type === item.type &&
      match.title === item.title &&
      (match.company ?? null) === item.company &&
      (match.position ?? null) === item.position &&
      (match.start_date ?? null) === item.start_date &&
      (match.end_date ?? null) === item.end_date &&
      match.mode === 'freewrite' &&
      match.content === item.content &&
      (match.links ?? null) === links &&
      match.source_slug === item.slug;
    if (unchanged) continue;

    db.prepare(`
      UPDATE repo_items
      SET type = ?, title = ?, company = ?, position = ?, start_date = ?, end_date = ?,
          mode = 'freewrite', content = ?, links = ?, source_slug = ?, updated_at = ?
      WHERE id = ?
    `).run(item.type, item.title, item.company, item.position, item.start_date, item.end_date,
      item.content, links, item.slug, new Date().toISOString(), match.id);
    updated.push(item.title);
  }

  return { created, updated };
}

/**
 * Run one sync. `force` ignores the unchanged-since-last-run check, which the
 * timer relies on to stay quiet when nothing in the folder has been edited.
 */
function syncPortfolio(db, config, newId, { force = false } = {}) {
  if (!config || !config.content_dir) {
    return { skipped: 'no portfolio folder configured' };
  }

  const { dir, items, signature } = readPortfolioItems(config.content_dir, config.base_url);
  if (items.length === 0) {
    return { skipped: `no write-ups found in ${dir}` };
  }
  if (!force && signature === config.last_signature) {
    return { skipped: 'unchanged since last sync', dir };
  }

  const result = applyItems(db, items, newId);
  db.prepare(`
    UPDATE portfolio_config
    SET last_signature = ?, last_synced_at = ?
    WHERE id = 'default'
  `).run(signature, new Date().toISOString());

  return { ...result, dir, total: items.length };
}

module.exports = {
  parsePortfolioFile,
  readPortfolioItems,
  syncPortfolio,
};
