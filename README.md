# Resume Builder

A local-first, multi-page web app for building and managing resumes. WYSIWYG inline editing, PDF export, and **web-session AI integration** (Claude / ChatGPT / Gemini) via a companion Chrome extension. No LLM API keys — automation runs against the user's logged-in browser chat tabs.

---

## Quick start

```bash
npm install
npm run dev          # starts both the Express API (port 3001) and Vite (port 5173)
```

Open `http://localhost:5173`. The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`.

If you only want the UI (no API features): `npm run dev:ui`

### Chrome extension (required for AI send)

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `extension/`
3. **Refresh** the Resume Builder tab after every extension reload (`Cmd+R`)

Extension version is in `extension/manifest.json` (currently **1.5.1**).

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────┐
│  React App (localhost:5173)                                    │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Layout  │  │ResumeEditor│  │Repository│  │  Ongoing   │  │
│  │ (sidebar)│  │ + Wizard   │  │  Page    │  │   Page     │  │
│  │          │  │ + AiPanel  │  │          │  │            │  │
│  └────┬─────┘  └─────┬──────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │              │               │          │
│       └──────────────┴──────────────┴───────────────┘          │
│                     react-router-dom v7                         │
└──────────────────────────────┬─────────────────────────────────┘
                               │ fetch /api/*
              ┌────────────────▼────────────────┐
              │  Express API  (localhost:3001)   │
              │  server/index.cjs               │
              │  better-sqlite3                  │
              │  ~/.resume-builder/data.db       │
              └─────────────────────────────────┘

AI path (separate):
  ResumeEditor → useAiBridge → postMessage → page-bridge.js
  → content-app.js → background.js → content-llm.js (on claude.ai etc.)
```

---

## Repository layout

```
ResumeBuilder/
├── src/
│   ├── App.tsx                     # BrowserRouter + route definitions
│   ├── main.tsx
│   ├── index.css                   # Global design tokens (CSS vars), Inter font
│   ├── components/
│   │   ├── Layout.tsx              # Sidebar nav shell (Outlet)
│   │   ├── Layout.css              # Design system: tokens, btn, card, field, badge
│   │   ├── ResumeEditor.tsx        # Wizard landing + editor canvas + toolbar
│   │   ├── ResumeBuilderWizard.tsx # Job-desc-first build flow (optimize PDF / repo)
│   │   ├── ResumeBuilderWizard.css
│   │   ├── ResumeDocument.tsx      # Resume template + inline editor
│   │   ├── ResumeDocument.css
│   │   ├── EditableText.tsx        # contentEditable wrapper (HTML for inline formatting)
│   │   ├── FormatToolbar.tsx       # Bold/italic/font/size bar above resume page
│   │   ├── ResumeWithJdNotes.tsx   # Resume + optional JD sidebar wrapper
│   │   ├── JdNotesPanel.tsx        # JD match notes sidebar + hover/click highlight
│   │   ├── AiPanel.tsx             # Provider, prompt, send/refine; saves version on apply
│   │   ├── AiResultModal.tsx       # Preview + id-scoped diff + apply + refine-in-same-chat
│   │   ├── ResumeDiffView.tsx      # GitHub-style change cards (added/removed/changed)
│   │   ├── PipelineStatus.tsx      # Amazon-style step circles during AI generation
│   │   ├── RepoImportPanel.tsx     # PDF / LinkedIn import → repository freewrite merge
│   │   ├── SaveSessionModal.tsx    # Name-on-first-save for History sessions
│   │   └── SaveSessionModal.css
│   ├── pages/
│   │   ├── RepositoryPage.tsx      # Experience/project warehouse (CRUD + inline edit + import)
│   │   ├── RepositoryPage.css
│   │   ├── OngoingPage.tsx         # Active tracking + dated reflections + compile-to-freewrite
│   │   ├── OngoingPage.css
│   │   ├── HistoryPage.tsx         # Saved editor sessions (open / delete)
│   │   ├── HistoryPage.css
│   │   ├── SettingsPage.tsx        # Resume render defaults: templates, fonts, style toggles
│   │   ├── SettingsPage.css
│   │   ├── KnowledgePage.tsx       # Stub — coming soon
│   │   └── PrivacyPage.tsx         # Static — explains local-only data storage
│   ├── hooks/
│   │   ├── useResumeState.ts       # Resume data + undo + localStorage
│   │   └── useAiBridge.ts          # Extension bridge + pipeline + scrapeUrl
│   ├── types/
│   │   ├── resume.ts               # Core data model (bullets with optional jdComment)
│   │   ├── repository.ts           # Repo/ongoing source types for wizard
│   │   ├── repoImport.ts           # Warehouse import payload types
│   │   ├── historySession.ts       # Saved editor session snapshot types
│   │   └── aiSession.ts            # Linked chat session type
│   ├── data/
│   │   └── defaultResume.ts        # Seed content
│   └── utils/
│       ├── pdf.ts                  # html2pdf capture (blob + download)
│       ├── aiPrompt.ts             # Prompt templates (JSON-only output, JD comments, repo import)
│       ├── parseResumeResponse.ts  # Extract, repair, normalize LLM JSON
│       ├── resumeDiff.ts           # Id-scoped diff (section/entry ids, not indices)
│       ├── repositorySources.ts    # Load/filter freewrite sources for wizard path B
│       ├── resumeBuildStyle.ts     # Content-selection profiles sent to LLM
│       ├── resumeSettings.ts       # Render templates + persisted style settings
│       ├── repoImport.ts           # Parse import JSON + merge into repo
│       ├── historySessions.ts      # History session API helpers + UTC formatting
│       ├── tokenEstimate.ts        # ~input token estimate (~4 chars/token)
│       ├── aiProviders.ts          # Claude / ChatGPT / Gemini URLs + config
│       ├── aiSessionStorage.ts     # localStorage for chat sessions
│       ├── aiPipeline.ts           # Pipeline variants + milestone step mapping
│       ├── jdNotes.ts              # Collect JD notes + anchor ids for sidebar
│       ├── formatSelection.ts      # Selection helpers for FormatToolbar
│       └── migrateResume.ts        # Legacy contact format migration
├── server/
│   └── index.cjs                   # Express + better-sqlite3 API server (CommonJS)
├── extension/
│   ├── manifest.json               # MV3 manifest
│   ├── background.js               # Tab orchestration, session storage, LinkedIn scrape
│   ├── content-app.js              # Bridge on localhost (→ background)
│   ├── content-scrape.js           # On-demand profile/page text extraction (LinkedIn)
│   ├── page-bridge.js              # Injected into page context (CSP-safe)
│   └── content-llm.js              # DOM automation on LLM sites
└── Laksh_Sarda_Resume.pdf          # Original reference resume
```

---

## Pages

| Route | Status | Description |
|-------|--------|-------------|
| `/resume` | Done | Wizard (optimize PDF or build from repo) + WYSIWYG editor + Web AI refinements |
| `/repository` | Done | Experience/project warehouse, SQLite-backed |
| `/education` | Done | Degrees, GPA, coursework, skills — separate from repository |
| `/ongoing` | Done | Active tracking with dated reflections |
| `/history` | Done | Saved editor sessions — open, delete, last updated (UTC) |
| `/settings` | Done | Resume render defaults: template, fonts, sizes, heading/title/date style |
| `/knowledge` | Stub | Notes and reference docs (not yet built) |
| `/privacy` | Done | Static explainer — all data is local |

---

## Data storage

### Browser localStorage

| Key | Content |
|-----|---------|
| `resume-editor-data` | `ResumeData` JSON |
| `resume-editor-show-jd-notes` | `"true"` / `"false"` — JD sidebar visibility in editor |
| `resume-render-settings` | Resume template/style defaults used by preview, editor, export, and generation hints |
| `resume-builder-ai-provider` | Last selected provider |
| `resume-builder-ai-sessions` | Array of `AiChatSession` (max 30) |

### SQLite — `~/.resume-builder/data.db`

Managed by `server/index.cjs` (better-sqlite3, WAL mode). Tables:

| Table | Purpose |
|-------|---------|
| `repo_items` | Repository entries (experience/project, optimized/freewrite) |
| `ongoing_items` | Active tracking items |
| `education_items` | Education records (school, degree, major, GPA, coursework) |
| `education_meta` | Skills & other fixed facts (singleton row) |
| `reflections` | Dated reflections belonging to an ongoing item |
| `resume_versions` | Resume snapshots saved on AI apply (legacy; separate from History sessions) |
| `history_sessions` | User-saved editor sessions (resume + JD + AI state); timestamps in UTC ISO |

`resume_versions` is still written on AI apply. **History** uses `history_sessions` — full editor snapshots the user saves explicitly from the Resume Builder toolbar.

---

## API routes (`server/index.cjs`)

```
GET    /api/repo                           list all repo items
POST   /api/repo                           create repo item
PATCH  /api/repo/:id                       update repo item
DELETE /api/repo/:id                       delete repo item
DELETE /api/repo                           delete all repo items

GET    /api/ongoing                        list ongoing items (with reflections embedded)
POST   /api/ongoing                        create ongoing item
PATCH  /api/ongoing/:id                    update ongoing item metadata
POST   /api/ongoing/:id/reflection         add reflection
PATCH  /api/ongoing/:id/reflection/:rid    edit reflection
DELETE /api/ongoing/:id/reflection/:rid    delete reflection
POST   /api/ongoing/:id/complete           mark done — sets end_date + compiles freewrite
DELETE /api/ongoing/:id                    delete ongoing item
DELETE /api/ongoing                        delete all ongoing items

GET    /api/education                      list education items + meta
POST   /api/education                      create education item
PATCH  /api/education/:id                  update education item
DELETE /api/education/:id                  delete education item
DELETE /api/education                      delete all education items + clear meta
PATCH  /api/education/meta                 update skills_note / other_notes

GET    /api/versions                       list resume version snapshots
POST   /api/versions                       save a version snapshot
DELETE /api/versions/:id                   delete a snapshot

GET    /api/history                        list history sessions (id, title, created_at, updated_at)
GET    /api/history/:id                    full session + snapshot JSON
POST   /api/history                        create session { title, snapshot }
PUT    /api/history/:id                    update session { snapshot, title? }
DELETE /api/history/:id                    delete session
DELETE /api/history                        delete all history sessions
```

---

## Design system

Global CSS variables are in `src/index.css`. Component-level shared styles (`.btn`, `.card`, `.field`, `.badge`, `.page`, `.form-row`, etc.) live in `src/components/Layout.css` — import it in any page that uses those primitives.

**Color palette:**
- Background: `#0f0f0f` / `#161616` / `#1e1e1e`
- Accent: `#e8d5b7` (warm off-white, not blue)
- Text: `#f0f0f0` / `#a0a0a0` / `#666`
- Font: Inter (loaded from Google Fonts)

Target audience is gen Z / under-35. Design should stay classy and minimal — avoid deep blues, heavy gradients, and the typical "AI product" aesthetic.

---

## Resume data model (`src/types/resume.ts`)

```typescript
ResumeData {
  contact: { name, links: [{ id, value }] }
  sections: [{
    id, type, title, jdComment?,
    entries: [{
      id, title, location, date, subtitle, jdComment?,
      bullets: [{ text, jdComment? }]
    }],
    skills?: [{ id, label, items, jdComment? }]
  }]
}
```

LLM output is constrained to a single ` ```json ` block. Most flows return `ResumeData` directly; the wizard optimize-PDF flow returns `{ baseline: ResumeData, optimized: ResumeData }` in one response so the app can diff the faithful PDF extraction against the tailored resume without a second LLM call. See `aiPrompt.ts`. Prompts require **preserving section/entry ids** when editing so diffs stay accurate across reordering.

---

## Resume builder wizard (`ResumeBuilderWizard.tsx`)

Opening `/resume` starts with a **wizard** (skip to editor anytime via **New build** in the toolbar later).

1. **Job description** — paste from company site (both paths)
2. Choose path:
   - **Optimize existing resume** — upload PDF + JD → one LLM call returns `{ baseline, optimized }`
   - **Build from repository** — choose build settings/custom conventions, then select freewrite sources from Repository + Ongoing (manual checkboxes or age filters)
3. **Generate tailored resume** via Web AI (extension required)
4. **AiResultModal** — id-scoped diff + preview with JD sidebar + post-generation renderer toggles + refine/apply
5. **Editor** — inline edits; persistent Style panel; **AiPanel** for further Send PDF / improvements in linked chat

Path A sends a single PDF-attached prompt that extracts the faithful baseline and optimized resume in one response, preserving the before/after diff without a second chat send. Path B sends **freewrite source material** (repo `mode=freewrite`; ongoing reflections or compiled freewrite), saved **Education Info** records/meta, a content-selection profile from `resumeBuildStyle.ts`, and user render/style preferences from `resumeSettings.ts`. Token estimates shown before generate.

Repository resume generation uses strict import-style JSON detection (`---JSON-START---` / `---JSON-END---`, balanced-object fallbacks, and substantive-content validation). Prompt schemas or placeholder JSON must never open an empty preview. The repository prompt has a hard one-page budget, must select high-signal entries instead of stuffing every source, must use saved education context rather than inventing education placeholders, and must not promote project/product URLs to personal contact links. Parser cleanup strips generated placeholder/editor artifacts such as `(edit)`, `Expected May 20XX`, and `GPA: X.XX` before content reaches the editor.

Generation does **not** lock the user into one visual template. The LLM returns `ResumeData` once; `AiResultModal`, the editor Style panel, and PDF export render that same JSON through the selected renderer.

The optimize path upload panel is **centered**. The generate button has no decorative icon — spinner only while running.

`PipelineStatus` renders **below the Generate button** (wizard) or below `AiPanel` (editor). See [AI pipeline progress](#ai-pipeline-progress) below.

### Diff viewer (`resumeDiff.ts` + `ResumeDiffView.tsx`)

Compares before/after resumes by **stable ids** (`section.id`, `entry.id`, `skill.id`) — **not** array position. Reordering Projects above Experience must **not** show false "replaced" bullets.

Each change card shows:
- **Changed** — red strikethrough "was on resume" + green "now on resume"
- **Added** / **Removed**
- **AI note** — blue dashed box, explicitly *not printed on the PDF*

---

## Resume editing (`ResumeDocument.tsx`)

- **Renderers**: `classic`, `stack`, and `keyword` live in `resumeSettings.ts`; they all render the same `ResumeData`
- **Template baseline**: LaTeX-style single column, US Letter (8.5×11in)
- **WYSIWYG**: `EditableText` (`contentEditable`) on all fields; supports inline HTML (bold, italic, font, size)
- **Post-apply style switching**: the editor toolbar's **Style** button opens a persistent style panel after generation/apply. Changing template, fonts, sizes, or italic/uppercase toggles updates the live preview and `#resume-export`.
- **High-level style settings**: `ResumeRenderSettings` controls body/heading fonts, name/heading/body/bullet sizes, line height, section heading bold/italic/uppercase, entry title bold/italic, subtitle italic, date bold/italic, skill-label bold, keyword terms, and generation notes.
- **Stack renderer**: splits supported tech stacks from `entry.subtitle` (usually `Role | Python, React, ...`) and displays the stack beside the entry name without changing the underlying JSON.
- **Keyword renderer**: bolds configured keywords in print/preview while preserving editable source text.
- **Editor chrome**: `+ link`, `+ bullet`, `+ entry` buttons are `position: absolute` in the gray margin — they do **not** appear in PDF export
- **`+ bullet` positioning**: sits at `bottom: 22px` on `.resume-entry` so it doesn't overlap the `+ entry` button which sits at `bottom: 0` on `.resume-section`

### Settings page (`SettingsPage.tsx`)

`/settings` edits global defaults persisted under `resume-render-settings`. These defaults seed the wizard, result preview, editor Style panel, History snapshots, and PDF export. Wizard build settings can override them for a single generation; applying the generated resume carries those selected render settings into the editor.

### Format toolbar (`FormatToolbar.tsx`)

Sits **directly above the resume page** (8.5in wide, offset by the 130px left control rail) — not in the top app header.

- **Bold**, **Italic**, **font family** (6 options: Times New Roman, Arial, Georgia, Calibri, Helvetica, Garamond), **font size** (9–14pt)
- **Requires a text selection** in the resume before applying font/size; hint shown when nothing is selected
- Selection is saved/restored when using dropdowns (`formatSelection.ts`) so focus doesn't wipe the highlight
- **Hide / Show JD notes** toggle lives inside this bar (right side) when the resume has JD comments

### JD match notes (`JdNotesPanel.tsx` + `ResumeWithJdNotes.tsx`)

After AI optimize/generate, the LLM may attach optional `jdComment` fields on sections, entries, bullets, and skills.

- **Not rendered on the resume page** — never included in PDF export
- Shown in a **sidebar** to the right of the page when enabled
- **Hover or click** a note card to **highlight** the matching anchor on the resume (`data-jd-anchor` attrs on `ResumeDocument`)
- Toggle via **Hide / Show JD notes** in the format toolbar (editor) or preview toolbar (`AiResultModal`)
- Preference persisted in `localStorage` key `resume-editor-show-jd-notes`

Collect notes with `collectJdNotes()` in `jdNotes.ts`. Diff viewer still shows JD commentary in blue dashed cards (`ResumeDiffView`).

### Editor canvas layout

The workspace is centered as one unit: `[130px rail][8.5in page][optional 308px JD panel]`. The format toolbar spans **only the 8.5in page column** (plus rail offset), not the JD sidebar width.

### PDF export (`src/utils/pdf.ts`)

1. Export targets `#resume-export` → `.resume-page-wrapper`
2. Before capture, wrapper is moved `position:fixed; opacity:1` (off-screen but full size)
3. **Never** use `width:0;height:0` on export container — html2canvas produces blank PDFs
4. `generateResumePdfBlob()` for AI send; `exportResumeToPdf()` for download
5. Blob size sanity check (`< 12KB` → error)

---

## State & undo (`useResumeState.ts`)

- Persists to `localStorage` key `resume-editor-data`
- **Undo**: history stack (max 50), debounced 700ms for text edits, immediate snapshot for deletes/adds
- `setData(data, immediateHistory?)` — destructive ops pass `true`

---

## AI integration

### Design constraints

- **NOT API-based** — uses user's logged-in web session
- **No iframes** — LLM sites block embedding
- **CSP** — cannot inject inline scripts; `page-bridge.js` is loaded via `chrome.runtime.getURL()` as external script
- **Extension context invalidated** — reloading extension orphans old content scripts; user must refresh app tab

### Pipeline

1. User enters instruction in `AiPanel` (with token estimate)
2. **Send PDF** → PDF blob → extension → new chat tab → wait → parse JSON
3. `AiResultModal` opens: resume preview + change list + linked chat name
4. User can **Send improvement** (same chat) or **Apply to editor**
5. On **Apply**: saves a version snapshot to `/api/versions`, then updates editor state
6. `PipelineStatus` shows **step circles** (not a percentage bar) throughout — see below

### AI pipeline progress

`PipelineStatus.tsx` maps raw extension/app events to **Amazon-style milestone circles** via `computeMilestoneStates()` in `aiPipeline.ts`. Milestones only advance on explicit completion signals (e.g. parsing completes on `parsing_json`, not when `sent` fires).

Call `startPipeline(variant)` in `useAiBridge` before each operation. Variants:

| Variant | When | Steps |
|---------|------|-------|
| `optimize` | Wizard — upload PDF + JD | Configuring chat session → Preparing prompt → Extracting and optimizing resume → Displaying resume |
| `write` | Wizard — build from repository | Configuring chat session → Preparing prompt → Writing resume → Displaying resume |
| `edit_pdf` | Editor — Send PDF | Configuring chat session → Preparing prompt → Applying AI edits → Displaying resume |
| `improvement` | Refine in same chat | Returning to chat session → Preparing prompt → Applying improvements → Displaying resume |

Duplicate extension `sent` events during a single model wait must **not** skip milestones ahead — guarded by `parseCount` / completion rules in `aiPipeline.ts`.

### Heartbeat

`content-llm.js` reports progress every **1s** while waiting for a model response. `useAiBridge` coalesces repeated `waiting` events; the active milestone label appears in the status line under the step circles.

### Bridge protocol

| Layer | Mechanism |
|-------|-----------|
| App → page | `window.postMessage({ source: 'resume-builder-app', requestId, payload })` |
| page-bridge → app | `window.postMessage({ source: 'resume-builder-bridge', ... })` |
| content-app → background | `chrome.runtime.sendMessage(payload)` |
| background → content-app | `chrome.tabs.sendMessage(tabId, { type: 'AI_PROGRESS', step, detail })` |
| content-app → app | `window.postMessage` + `resume-bridge-progress` custom event |

Message types (background):

| Type | Purpose |
|------|---------|
| `CONNECT` | Open provider tab (optional) |
| `SEND_PDF` | New chat → attach PDF → paste prompt → submit → wait → return JSON |
| `SEND_PROMPT` | New chat → text-only prompt (repository build path) |
| `SEND_IMPROVEMENT` | Reuse `tabId` from session → text-only follow-up |
| `SCRAPE_URL` | Open LinkedIn profile URL → return visible page text for repo import |

### LLM response capture (`content-llm.js`)

1. Snapshot baseline assistant text before submit
2. Poll every 350ms for up to 180s
3. Detect streaming via stop button or `[data-is-streaming="true"]`
4. **Only return when JSON is complete** — waits for closed ` ```json ` fence
5. **ChatGPT** — prefers `<pre><code>` content from latest assistant turn
6. **Gemini** — two-step upload: open `+` menu → "Upload files" → assign PDF to file input

Submit verification must not trust the pre-submit composer node after click/keyboard/form submit. Claude can accept the prompt, clear or replace the live composer, and continue generating while a stale DOM reference still contains the old prompt. `verifyMessageSubmitted()` re-queries the live composer, polls for streaming/rendered-prompt/composer-cleared evidence, and checks for late parseable responses before surfacing a send-button-disabled error.

**Fragile area:** LLM DOM changes frequently. Selectors in `PROVIDER_SELECTORS` and upload-button logic will need updates when providers ship new UI.

---

## Repository page (`RepositoryPage.tsx`)

Think of this as a data warehouse — not everything here ends up on a resume. Two entry modes:

- **Resume-optimized**: bullet-point format with action-verb tips shown inline
- **Freewrite**: raw narrative, will be AI-optimized later

Full inline editing: click the pencil icon on any expanded entry to edit all fields in place.

### Import (`RepoImportPanel.tsx`)

**Import** on Repository, Ongoing, and Education opens a panel with two paths:

| Source | Flow |
|--------|------|
| **Resume PDF(s)** | Multi-file upload → `SEND_PDF` (same path as resume wizard extract) → merge into `repo_items` |
| **LinkedIn URL** | Extension scrapes profile in a background tab → scraped text embedded directly in a `SEND_PROMPT` import prompt → merge |

LinkedIn import deliberately uses a **text-only prompt** after scraping. Do not convert scraped text into a generated PDF; hidden/off-screen PDF rendering can produce blank files for Claude.

Import rules (see `repoImport.ts`, `educationImport.ts`):

- Repository imports save experiences/projects as **`freewrite`** — never resume-optimized bullets
- Education (school, GPA, major, coursework) goes to **Education Info**; skills/other facts to education meta
- **Merge by identity**: matches existing repo entries by normalized identity, with fuzzy support for title/company/date differences between LinkedIn and resume extracts
  - If LinkedIn and resume disagree on `experience` vs `project`, merge only when title plus company/date/content evidence strongly indicates the same item; preserve the existing type so the user can toggle it in the card editor
  - Explicit `merge_target_id` match → replace the saved freewrite with the LLM's coherent merged version of existing + incoming facts
  - Fuzzy/local match without `merge_target_id` → append new freewrite with an `Imported (source)` divider; skip duplicate text
  - No match → create new repo entry
  - Empty metadata fields (dates, company) may be filled; populated fields are not replaced
- **Cross-links Ongoing items** — entries with no end date (or marked Present/Current) also create or update a matching active Ongoing item using the same normalized identity matcher. Imported freewrite is added as a dated reflection; empty metadata fields are filled without overwriting populated ones.
- **Contradictions require review** — mutually exclusive facts are paused in a review table. Choosing **Existing** or **Incoming** applies the selected field; repository conflicts can use LLM-provided clean freewrite variants for each choice, so conflict notes are not saved into the warehouse text.
- **Diagnostics are programmatic** — import failures surface extension debug events in the panel with a single copy action. Do not ask the user to paste console snippets for normal debugging.

Requires Chrome extension (v1.5.1+) for PDF send, LinkedIn scrape (`SCRAPE_URL` bridge message), background capture polling, and import diagnostics.

Each of Repository, Ongoing, Education, and History has a **Delete all** button (with confirmation) that clears that tab's data via collection `DELETE` routes (`/api/repo`, `/api/ongoing`, `/api/education`, `/api/history`).

---

## Education page (`EducationPage.tsx`)

Separate from the experience/project warehouse. Stores:

- **School records** — degree, major, GPA, graduation date, location, coursework/honors/notes
- **Skills & other notes** — languages, tools, certifications, awards (imported from `profile.skills_note` / `profile.other_fixed_facts`)

Import from Repository/Ongoing/Education routes education to this page, not the repository.

Skills/notes are **saved automatically on import**. The Skills & other notes summary is collapsible like school records; use **Edit notes** to change the saved meta fields.

---

## Ongoing page (`OngoingPage.tsx`)

Track active experiences/projects. Reflections are timestamped notes added over time. When you mark an item done:
- Sets end date
- Compiles all reflections into a freewrite block
- Freewrite is editable and will later be AI-optimized into resume bullets

Full inline editing: item metadata (pencil on card), each reflection (pencil on reflection row), compiled freewrite (edit button in done section).

**Import** uses the same `RepoImportPanel` as Repository — it still writes freewrite to **Repository**, and also cross-links **Ongoing** for current roles/projects (see Import rules above).

---

## History page (`HistoryPage.tsx`)

Saved **editor sessions** — not the same as `resume_versions` (AI-apply snapshots).

- **Save** in the Resume Builder toolbar stores: resume JSON (incl. JD match comments), job description, linked AI session, JD sidebar toggle, zoom, AI edit prompt
- Saved snapshots also include `renderSettings`, so History reopen restores the selected template/style controls used by preview/export.
- First save prompts for a **session title**; later saves update the same session (UTC `created_at` / `updated_at` on server)
- **History** lists sessions with last updated; **Open** loads `/resume?session=<id>`

---

## History page (legacy note — `resume_versions`)

**What `resume_versions` is:** snapshots written automatically on AI apply (and seeded as "Original" on first load). The History **page UI** does not list these — it uses `history_sessions` instead.

**What it is NOT:** a resume version diff viewer inside the resume builder. Version diffs are already shown in `AiResultModal` immediately after an AI edit.

---

## Known pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| "Extension context invalidated" | Extension reloaded, app tab not refreshed | Reload extension + refresh app |
| API calls return HTML 404 | Express server not running | `npm run dev` (not `dev:ui`) |
| Blank PDF | Export container had zero dimensions | Keep export wrapper at 8.5in width |
| 2-page PDF | Editor controls in document flow | Controls are `position:absolute`; no `min-height:11in` on page |
| Gemini file upload failed | Two-step menu flow | Update `attachFileToGemini()` selectors |
| "LLM returned invalid JSON" | Response captured before fence closed | Wait for full reply; retry or send improvement |
| "Send button stayed disabled" after provider generated anyway | Submit verifier read a stale pre-submit composer node | Re-query live composer, poll for streaming/rendered prompt, and accept late parseable response evidence in `content-llm.js` |
| Stuck "Waiting for response" | DOM selectors don't match provider UI | Update `content-llm.js` selectors |
| Generated resume has `(edit)` / fake GPA / fake contact | Prompt allowed editable placeholders or education/contact context was missing | Repository generation includes `/api/education`, prompt forbids visible editor notes, parser strips known placeholder artifacts |
| Generated resume omits education | Wizard only sent repository/ongoing freewrite | Repository generation now sends saved Education Info records and meta notes with the prompt |
| Applied resume cannot change template/style | Style controls existed only before generation | Editor toolbar **Style** panel changes renderer/fonts/sizes/toggles after apply and drives PDF export |
| Format dropdown does nothing | No text selected, or selection lost on focus | Highlight text first; use dropdown after selection is saved |
| Step tracker jumps ahead | Extension fires duplicate `sent` events | Milestone logic in `aiPipeline.ts` — only advance on completion signals |
| HistoryPage.css HMR error | Old CSS file was deleted, Vite cached the import | Hard refresh (`Cmd+Shift+R`) |
| Import does nothing | Extension not reloaded after update | Reload extension v1.5.1+ + refresh app |
| Provider tab steals focus during import/generate | Extension used to activate the provider tab before send | v1.4.6+ keeps provider sends in background; do not activate Claude/ChatGPT/Gemini tabs during normal sends |
| Import prompt only sends after visiting provider tab | Hidden-tab composer/button state lagged during import sends | v1.4.8+ writes to one composer instance, avoids false prompt-readback failures, and tries keyboard/form submit fallbacks before waiting on the send button |
| Claude finishes import but dashboard never merges | Extension missed the rendered JSON or app parser accepted the wrong candidate | v1.5.1+ uses explicit JSON delimiters, backup polling, real-payload validation, and app-copyable diagnostics |
| Repo import response not captured | Extension only detected resume JSON (`sections`/`contact`), not warehouse JSON (`entries`) | v1.4.4+ accepts both schemas |
| Delete all does nothing | Old `/all` routes hit `/:id` with id `"all"` | Restart API server; use collection routes (`DELETE /api/repo`, etc.) |
| Education skills not saved after import | `PATCH /api/education/meta` was shadowed by `/:id` route | Fixed — meta route registered first; import saves skills/notes directly |
| LinkedIn import empty | Not logged in or profile not fully loaded | Log into LinkedIn in Chrome, retry URL |
| Import duplicated Ongoing | Re-import of same ongoing entry | Skipped if reflection content already present; metadata only fills empty fields |

---

## Scripts

```bash
npm run dev       # API server (port 3001) + Vite dev server (port 5173) — use this
npm run dev:ui    # Vite only (no API — repo/ongoing/history features won't work)
npm run server    # API server only
npm run build     # tsc + vite build → dist/
npm run lint      # ESLint
```

---

## Tech stack

- **React 19** + TypeScript + Vite 8
- **react-router-dom v7** — client-side routing
- **Express 5** + **better-sqlite3** — local API server (`server/index.cjs`, CommonJS)
- **html2pdf.js** (html2canvas + jsPDF) — client-side PDF
- **lucide-react** — icons
- **concurrently** — runs API + Vite together
- **Chrome Extension MV3** — AI bridge
- No cloud backend, no LLM API keys

---

## Guidance for future agents

### Safe to change

- `ResumeDocument.css` / canvas layout in `ResumeEditor.css` — toolbar is 8.5in wide above page; test PDF export after
- `FormatToolbar.tsx` / `formatSelection.ts` — selection must be preserved for dropdowns
- `JdNotesPanel` highlight uses `data-jd-anchor` on `ResumeDocument` — keep ids in sync with `jdNotes.ts`
- Prompt wording in `aiPrompt.ts`
- Pipeline milestone mapping in `aiPipeline.ts` — must stay aligned with `startPipeline()` variants in wizard/AiPanel
- Default resume content in `defaultResume.ts`
- Token estimate heuristic in `tokenEstimate.ts`
- Page stubs: `KnowledgePage.tsx` — placeholder
- `RepoImportPanel.tsx` / `repoImport.ts` — explicit `merge_target_id` imports replace repo freewrite with the LLM's coherent merged version; fuzzy local matches still append
- `historySessions.ts` / `history_sessions` table — snapshot shape must stay aligned with `ResumeEditor` save/load

### Change with care

- `pdf.ts` capture positioning — easy to break PDF output
- `content-llm.js` selectors and upload flows — test on all three providers after changes
- `content-scrape.js` + LinkedIn DOM — profile layout changes frequently
- `parseResumeResponse.ts` — must stay aligned with extension capture logic
- `resumeDiff.ts` — match by stable ids only; never compare by section/entry index
- `useAiBridge` message protocol — must stay in sync with the extension
- `ResumeData` schema — update prompt, parser, and normalizer together
- `server/index.cjs` schema changes — better-sqlite3 won't auto-migrate; handle manually or add migration logic
- `+ bullet` CSS position (`bottom: 22px`) — was deliberately offset to not overlap `+ entry`; don't reset to 0

### Do not do without user request

- Add API-key-based LLM calls (explicitly rejected)
- Commit secrets or `.env` with keys
- Inline script injection in extension (CSP blocks it)
- Put JD comments inline on the resume page (sidebar only; hidden in PDF)
- Put editor controls or format toolbar inside `.resume-page` document flow
- Move the API server to ESM (`"type": "module"` in package.json would break `server/index.cjs`)

### Pages not yet built — intended design

**Knowledge page** (`/knowledge`): Notes and reference material that inform resume writing. No design specified yet.

**Future History enhancements:** timeline of repo/ongoing additions, or browsing `resume_versions` AI snapshots — not in current History UI.

### Testing checklist

1. Edit resume inline → undo → auto-save survives refresh
2. Download PDF → content present, single page
3. Reload extension → refresh app → Bridge ready
4. Wizard: optimize PDF with JD → one provider send returns baseline + optimized preview; step tracker advances correctly
5. Wizard: build from repository → freewrite sources only → preview modal with JD sidebar highlight
6. Editor: select text → font/size dropdowns apply; bold/italic work
7. JD notes toggle → sidebar + hover/click highlight; hidden in PDF download
8. Send PDF / improvement in editor → step circles below panel → linked chat refinements work
9. Apply AI edits → version saved to `resume_versions`
10. **Save** session → name on first save → **History** open restores editor state
11. Repository **Import** PDF → freewrite entries created/merged; ongoing roles cross-linked on Ongoing page
12. Repository + Ongoing CRUD survives reload
13. `npm run dev` — both servers start; `/api/repo` returns `[]` not HTML

---

## Reference

Original resume PDF: `Laksh_Sarda_Resume.pdf`
Extension-specific notes: `extension/README.md`
SQLite database: `~/.resume-builder/data.db`
