# Resume Builder

A local-first, multi-page web app for building and managing resumes. WYSIWYG inline editing, PDF export, and **web-session AI integration** (Claude / ChatGPT / Gemini) via a companion Chrome extension. No LLM API keys — automation runs against the user's logged-in browser chat tabs.

---

## Quick start

```bash
npm install
npm run dev          # starts both the Express API (port 3001) and Vite (port 5173)
```

Open `http://localhost:5173`. The Vite dev server proxies all `/api/*` requests to `http://localhost:3001`.

**Download PDF needs a TeX engine.** The resume PDF is compiled from LaTeX by [Tectonic](https://tectonic-typesetting.github.io/): `brew install tectonic` (about 20 MB; it fetches the packages it needs on first compile, so the first download takes a minute, later ones under a second). Without it the API returns a clear 503 and the download fails.

If you only want the UI (no API features): `npm run dev:ui`

### Personal details (gitignored)

Your contact details, the starter resume, and the prompt examples drawn from your own experiences live in `frontend/src/personal/personal.local.ts`, which is gitignored. Without it the app falls back to the placeholder profile in `personal.example.ts`. To set yours up, copy `personal.example.ts` to `personal.local.ts`, change `export const examplePersonalProfile` to `export default`, and fill it in. The field documentation is in `frontend/src/personal/types.ts`.

### Chrome extension (required for AI send)

1. Open `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `extension/`
3. **Refresh** the Resume Builder tab after every extension reload (`Cmd+R`)

Extension version is in `extension/manifest.json` (currently **1.5.23**).

---

## Architecture overview

```
┌────────────────────────────────────────────────────────────────┐
│  React App (localhost:5173)                                    │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Layout  │  │ResumeEditor│  │Repository│  │ Education  │  │
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
              │  backend/index.cjs              │
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
│   │   ├── ResumeRenderSettingsControls.tsx # Shared full renderer controls
│   │   ├── ResumeRenderSettingsControls.css
│   │   ├── EditableText.tsx        # contentEditable wrapper (HTML for inline formatting)
│   │   ├── FormatToolbar.tsx       # Bold/italic/font/size bar above resume page
│   │   ├── ResumeWithJdNotes.tsx   # Resume + optional JD sidebar wrapper
│   │   ├── JdNotesPanel.tsx        # JD match notes sidebar + hover/click highlight
│   │   ├── AiPanel.tsx             # Provider, prompt, send/refine; saves version on apply
│   │   ├── AiResultModal.tsx       # Preview + id-scoped diff + apply + refine-in-same-chat
│   │   ├── ResumeDiffView.tsx      # GitHub-style change cards (added/removed/changed)
│   │   ├── PipelineStatus.tsx      # Amazon-style step circles during AI generation
│   │   ├── RepoImportPanel.tsx     # PDF / LinkedIn import → repository freewrite merge
│   │   └── LatexSourceModal.tsx    # View / copy / download / Open-in-Overleaf for the generated .tex
│   ├── pages/
│   │   ├── RepositoryPage.tsx      # Experience/project warehouse (CRUD + inline edit + import); ongoing = no end date
│   │   ├── RepositoryPage.css
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
│   │   ├── repository.ts           # Repository source types for wizard
│   │   ├── repoImport.ts           # Warehouse import payload types
│   │   ├── historySession.ts       # Saved editor session snapshot types
│   │   └── aiSession.ts            # Linked chat session type
│   ├── data/
│   │   └── defaultResume.ts        # Seed content
│   └── utils/
│       ├── latex.ts                # ResumeData + settings → Jake-style .tex; compile via /api/latex/pdf
│       ├── sectionOrder.ts         # Section ordering shared by the renderer and the LaTeX generator
│       ├── pdf.ts                  # DOM text-PDF writer (cover letter download, AI-send blob, page-fit measurement)
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
├── backend/
│   └── index.cjs                   # Express + better-sqlite3 API server (CommonJS)
├── extension/
│   ├── manifest.json               # MV3 manifest
│   ├── background.js               # Tab orchestration, session storage, LinkedIn scrape
│   ├── content-app.js              # Bridge on localhost (→ background)
│   ├── content-scrape.js           # On-demand profile/page text extraction (LinkedIn)
│   ├── page-bridge.js              # Injected into page context (CSP-safe)
│   └── content-llm.js              # DOM automation on LLM sites
├── gemini-attach-test/             # Standalone experiment: proves Gemini file attach via CDP file-chooser interception (see next_steps.md)
├── next_steps.md                   # Open product/prompt improvements to handle next
└── <Your_Name>_Resume.pdf          # Original reference resume (gitignored)
```

---

## Pages

| Route | Status | Description |
|-------|--------|-------------|
| `/resume` | Done | Wizard (optimize PDF or build from repo) + WYSIWYG editor + Web AI refinements |
| `/repository` | Done | Experience/project warehouse, SQLite-backed; ongoing items are just entries with no end date (shown as "present") |
| `/education` | Done | Degrees, GPA, coursework, skills — separate from repository |
| `/history` | Done | Autosaved editor sessions (titled by date and time) — open, delete, last updated (UTC) |
| `/settings` | Done | Resume render defaults: template, fonts, sizes, spacing, weight/intensity, heading/title/date style |
| `/knowledge` | Stub | Notes and reference docs (not yet built) |
| `/privacy` | Done | Static explainer — all data is local |

---

## Data storage

### Browser localStorage

| Key | Content |
|-----|---------|
| `resume-editor-data` | `ResumeData` JSON |
| `resume-editor-show-jd-notes` | `"true"` / `"false"` — JD sidebar visibility in editor |
| `resume-render-settings` | Resume template/style defaults, section/name fonts, typography weights/intensity, spacing, and generation density hints such as min/max bullets per experience |
| `resume-builder-ai-provider` | Last selected provider |
| `resume-builder-ai-sessions` | Array of `AiChatSession` (max 30) |

### SQLite — `~/.resume-builder/data.db`

Managed by `backend/index.cjs` (better-sqlite3, WAL mode). Tables:

| Table | Purpose |
|-------|---------|
| `repo_items` | Repository entries (experience/project, optimized/freewrite); no end date = ongoing/"present" |
| `education_items` | Education records (school, degree, major, start date, graduation date, GPA, coursework) |
| `education_meta` | Skills & other fixed facts (singleton row) |
| `resume_versions` | Resume snapshots saved on AI apply (legacy; separate from History sessions) |
| `history_sessions` | Autosaved editor sessions (resume + JD + AI state), titled `YYYY-MM-DD HH:mm` at creation; timestamps in UTC ISO |

`resume_versions` is still written on AI apply. **History** uses `history_sessions` — full editor snapshots the Resume Builder writes automatically as the user works (see [History page](#history-page-historypagetsx)).

---

## API routes (`backend/index.cjs`)

```
GET    /api/repo                           list all repo items
POST   /api/repo                           create repo item
PATCH  /api/repo/:id                       update repo item
DELETE /api/repo/:id                       delete repo item
DELETE /api/repo                           delete all repo items

GET    /api/education                      list education items + meta
POST   /api/education                      create education item (school, degree, major, start_date, grad_date, gpa, location, coursework)
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

**Color palette — light, deliberately not white.** The object on screen is a sheet of white paper. If the app ground goes near-white the résumé stops reading as a document and becomes a region of the page, so the shell is a *worktable* and the page sits on it. Neutrals are biased green-grey — the same hue family as the accent — so the shell reads as an extension of the identity rather than a new hue.

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#eaeee9` | app ground |
| `--surface` | `#f7f9f5` | cards, drawers, popovers (lifted) |
| `--surface-2` | `#dfe5dd` | inputs, wells (recessed) |
| `--surface-3` | `#d3dad0` | chips, secondary fills, the editor canvas behind the page |
| `--border` | `#cfd6cd` | hairline: decorative card edges, dividers |
| `--border-2` | `#6f786d` | **every text control** — 3.21:1 on the deepest surface |
| `--ink-on-fill` | `#f7f9f5` | glyph/label sitting *on* a filled colour chip |
| `--green-ring` / `--amber-ring` / `--red-ring` | 24% alpha | pulse/focus halos — must stay translucent |
| `--text-1/2/3` | `#161a15` / `#4d524b` / `#575c53` | |
| `--accent` | `#2f5c42` | deep sage — the previous `#adc5b3` inverted for a light ground |
| `--accent-ink` | `#f7f9f5` | what sits *on* a filled accent button (7.26:1) |
| `--green` / `--amber` / `--red` | `#256039` / `#734b0e` / `#9a3020` | |
| Font | Inter (Google Fonts) | |

Target audience is gen Z / under-35. Design should stay classy and minimal — avoid deep blues, heavy gradients, and the typical "AI product" aesthetic.

**Never hardcode a colour.** There used to be 411 hex literals against 661 `var(--…)` uses, which is why the previous re-theme left a beige `#e8d5b7` hover on History, a whole dark parallel palette in `FormatToolbar.css`, and a light-styled JD panel rendering at 1.19:1 on a dark ground. Every app-chrome sheet is now fully tokenised. Two files legitimately pin their own values and are the *only* exceptions: `ResumeDocument.css` and `CoverLetterDocument.css` — those render on white paper, which never follows the theme.

- Translucent lifts use `--raise-1/2/3`, never a raw `rgba(255,255,255,·)`. They tint toward ink on a light ground and toward light on a dark one, so one declaration reads correctly in both.
- Status tints use `--green-bg` / `--amber-bg` / `--red-bg`, never a literal rgba of the status hue.

**Dark theme.** The values this app shipped with are preserved verbatim under `:root[data-theme='dark']` in `index.css`. Nothing sets the attribute today; set it on `<html>` to get the old theme back wholesale. Because the chrome is fully tokenised, that is the entire switch.

**Re-picking status colours is not optional on a theme change.** The old `--green #4ade80`, `--red #f87171` and `--amber #fbbf24` were chosen for near-black and land at 1.54 / 2.45 / **1.48** on this ground — that last one is the *Under 1 page* pill, the most important status in the product. Measure, don't carry over.

**Button hierarchy.** Exactly **one filled/accent button per surface** — the primary action (Download PDF in the editor, Generate tailored resume in the wizard, Add school on Education). Everything else is `--ghost`/`--secondary` (transparent + border). Destructive actions (`Reset`, `Delete all`) use the danger variant AND are separated from the rest of the row — by a `.editor-toolbar-divider` in the editor, or `margin-right: auto` in a page toolbar. Disabled means `opacity: 0.38` + `saturate(0.4)` + `not-allowed`; a control whose prerequisites aren't met disables itself and explains why via `title` (see `actionBlockedReason` in the wizard) rather than failing after the click.

**Contrast — text.** Every text tier clears WCAG AA (4.5:1) against all four surfaces. Measured, lightest surface first: `--text-2` 7.55/5.61, `--text-3` 6.48/4.81, `--accent` 7.26/5.39. The lowest ratio anywhere in the set is 4.81. Don't lighten any ink or darken any surface without re-measuring. A composited sweep of every text node on `/resume`, `/settings`, `/repository`, `/history`, `/bulk` and `/education` currently returns **0 failures**. The settings `.info-dot` takes the panel's full text colour and a 3:1 border, not the muted body grey.

**Contrast — non-text, and this is the one that gets forgotten.** Text contrast was swept and clean while text *boxes* were invisible, because a text sweep never looks at a border. WCAG 1.4.11 wants **3:1 for the boundary that identifies a control**, and it has to hold against the deepest surface that control can sit on — the wizard's inputs sit on `--surface-2` panels, where a `--border-2` tuned against `--bg` measured 2.98 and the boxes vanished into the panel. Run **both** sweeps after any palette change:

```js
// non-text: every input/textarea/select must clear 3:1 by fill OR border
document.querySelectorAll('input,textarea,select').forEach(el => { /* max(fillRatio, borderRatio) >= 3 */ })
```

Native `<input type=checkbox>` reports `borderWidth: 0` and will always show as failing — the UA draws its own boundary, so check those by eye, not by number.

**Ink on a coloured fill is `--ink-on-fill`, never `--text-1`.** A check mark inside a filled status dot, a label on a filled badge. `--text-1` is near-black on this theme and status fills are dark, which is exactly how the council progress ticks ended up black-on-brown. Related: a pulse or focus halo (`box-shadow: 0 0 0 4px …`) must use a `*-ring` token — a solid ring renders as a fat blob, not a glow.

**Status colours carry meaning; don't collapse them.** Done is `--green`, in flight is `--amber`, failed is `--red`. A palette sweep once mapped an orange to `--amber` for both the complete and active pipeline states, so a finished step and a running step looked identical.

**Focus.** One global rule in `index.css` gives every interactive element a 2px accent ring on `:focus-visible`. It uses `:is(…)`, not `:where(…)`, on purpose: `:where()` is specificity-0 and lost the tie-break to the `outline: none` declarations scattered through the component sheets, so the ring silently never appeared. Inside `.resume-page` the ring pins `#2f5c42` rather than taking the token, because the paper is white in every theme. Hover-only controls also reveal on `:focus-within`, plus a `.resume-control:focus-visible` backstop — without it Tab walked onto an *invisible* `×` that deletes a contact line.

**Selection state must be more than a border colour.** A selected card comes up to `--surface` (lifted) with a doubled accent edge (`border-color` + `inset 0 0 0 1px`) and an accent title; the resting state stays recessed at `--surface-2`. A 1px border swap alone is invisible, and an `--accent-dim` tint on a light ground makes the *selected* card the paler of the two, which reads backwards.

**Bounded numeric settings use sliders**, never bare number inputs — with a live value chip and the min/max endpoints rendered. Small integer ranges (bullet counts) use `<Stepper>` instead, which disables at the bounds. Both retired the typed-draft workarounds that number inputs needed to stop them snapping mid-keystroke.

**Style scope.** The Settings page is the only writer of the global `resume-render-settings`. The editor's Style **drawer** is per-resume: it never persists globally, is labelled "Overrides for this resume", and offers "Reset to global default". It is a fixed right-hand drawer rather than an inline panel so changing a value doesn't push the live preview down the page.

**Empty states** all use `.empty-state` (centred icon + one line). Pending pages use it with "Coming soon"; the icon takes `--text-3` rather than an inline low opacity.

**Preview surfaces** (the result modal, the candidate-review modal, the Settings live preview, the editor canvas) put the white résumé page on `--surface-3` so it reads as paper on a worktable — luminance ratio 1.43, enough for a real edge, with the shadow doing the lift. They used to carry their own slate-blue light theme; they now take the app tokens like everything else. The page itself stays `#fff`.

**One measure per page.** `.page` is 900px via `--page-measure`; genuinely two-column surfaces (Settings, Bulk) take `.page--wide` (1120px). There used to be three widths — `.page` 900, the wizard 920, Settings 980 — so walking Repository → Resume Builder → Settings shifted the content edge twice for no reason. Don't invent a fourth.

**Nothing may shift sideways mid-interaction.** `scrollbar-gutter: stable` is set on both `html` and `.layout-main`, because the document is the scroller on tall pages and the layout column only takes over when height-constrained. Separately, `.rb-wizard` needs `width: 100%`: it lives in a column flex container, so `margin: auto` alone made it shrink-to-fit and picking a build mode jumped the whole column ~50px left as it re-centred.

**The editor is an app shell, not a scrolling page.** `.editor--doc` is `height: 100vh; overflow: hidden`; only `.editor-canvas` scrolls (`flex: 1 1 auto; min-height: 0` — the `min-height` is load-bearing or the outer scrollbar returns). Before this, 242px of chrome — Download PDF, the autosave status, Undo, Reset, the page-fit pill and the whole format toolbar — scrolled away the moment you reached the Experience section.

**Nothing may float over the résumé.** The format bar is `<FormatToolbar variant="dock">`, a **sibling** of `.editor-canvas` inside the fixed chrome — never a child of the scrollport. The first attempt kept it inside `.editor-canvas-stack` and made it `position: sticky`, which did keep it reachable but meant it sat on top of the page and hid the top of whatever you were reading. If a control needs to stay put while the document scrolls, put it in the chrome; do not stick it over the canvas. The `canvas` variant (a tab attached to a page top) survives only for the result modal, whose preview stack is static.

**The AI panel is a mode, not chrome.** Its two prompt fields and status block collapse behind an *Edit prompt* disclosure, default closed, persisted in `resume-editor-ai-panel-open`. The controls row (provider, Connect, Preview prompt, Send PDF) never collapses. Note the `[hidden]` trap: `display: grid`/`flex` outranks the UA's `display: none`, so any collapsible container needs an explicit `&[hidden] { display: none }`.

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

LLM output is constrained to explicit JSON only. New import/generation paths prefer `---JSON-START---` / `---JSON-END---` delimiters so capture can distinguish the answer from prompt/schema text; older edit/refine paths may still use a single ` ```json ` block plus `---END---`. Most flows return `ResumeData` directly; the wizard optimize-PDF flow returns `{ baseline: ResumeData, optimized: ResumeData }` in one response so the app can diff the faithful PDF extraction against the tailored resume without a second LLM call. See `aiPrompt.ts`. Prompts require **preserving section/entry ids** when editing so diffs stay accurate across reordering.

**Prompt architecture — one authority per instruction.** The assembled repository prompt had drifted into restating the same rule across four layers (bolding 12×, one-page 7×, bullet counts 6×) and in places contradicting itself. Ownership is now split and must stay split:

| Owns | Module |
|---|---|
| Page limit, section order/headings, entry density, bullet counts, renderer style | `buildSettingsInstructions` (`resumeSettings.ts`) |
| Bullet writing, bullet length, action verbs, bold emphasis, reader/audience framing | `resumeWritingRules.ts` (`RESUME_WRITING_CONTRACT`) |
| Layout invariants (company-first, project subtitles, tech-stack placement), contact, truthfulness | the build prompt in `aiPrompt.ts` |
| Genuinely template-specific selection bias and visual conventions | `resumeBuildStyle.ts` |

`RESUME_WRITING_CONTRACT` is shared by the repository build, the optimize path, every council candidate, **the judge**, the expand action, and the edit/refine loop — the judge included, because it writes the resume that ships and would otherwise regress to whatever the candidates did. It specifies: a semi-technical recruiter reading ~200 resumes at 10–20s each; WHAT (a concrete noun for the thing built) → RESULT → at most one HOW clause per bullet, one subject per bullet (never two systems fused into one sentence), with numbers only where they impress (about half the bullets per entry carry one; the rest state a concrete outcome in words) and a hard no-fabrication rule; an anchor first bullet per entry whose first five words name what was built, never a metric or method first (`RESUME_CLARITY_RULES`); a "impress the human first" block that puts selectivity and validation facts (accelerator acceptance, awards, user counts) on the subtitle line or first bullet and names the recognizable discipline (deep reinforcement learning, distributed systems) in the anchor; bullets in one of two shapes, a full single line (17–20 words) or a full second line (34–40 words), never the 21–33-word dead zone that strands a few words on line two; a past-tense action verb that repeats nowhere in the resume, drawn from a 5-category bank, with `worked on`/`helped`/`assisted`/`responsible for`/`utilized`/`participated in`/`developed`/`implemented` banned; a generic-language ban (`RESUME_PLAIN_LANGUAGE_RULES`); the bold-emphasis budget; and the mechanical conventions in `RESUME_MECHANICS_RULES` — en-dash `Mon YYYY – Mon YYYY` ranges in every date field, no terminal periods on bullets, and **education always as a start-to-graduation range** (`Aug 2025 – May 2029`, never a lone graduation month, never "Expected"; when only a graduation date is known the start is derived as August of the year that is the program length earlier — 4 years for a bachelor's, 2 for a master's).

**Education dates have a deterministic backstop.** Models still sometimes emit only the graduation month, so `educationDates.ts` (`enforceEducationDateRanges`) runs on every generated resume — solitary and council builds, the judge's final, the optimize path's `optimized`, and bulk jobs — and rewrites any education entry whose date is not already a range, from the saved Education record's `start_date`/`grad_date` (or the same derivation rule when no start is stored). Entries that already carry a range are left exactly as written; the optimize `baseline` is never touched.

`RESUME_PLAIN_LANGUAGE_RULES` is the resume's counterpart to the cover letter's banned-word list, which the resume went without for a long time even though a bullet is where padding costs most — the page is one page, so every filler adjective evicts a real noun. It bans the "robust scalable seamless" register outright, and states the rule behind the list so it generalises: **the deletion test** — strike the word and re-read; if the meaning is unchanged, it was decoration. Two corollaries carry most of the weight: never assert a quality without the evidence for it (`robust` → the uptime number that earned it), and never describe the candidate rather than the work (`passionate`, `detail-oriented`). Note `ACTION_VERB_RULES` only ever governed the *leading* verb, so mid-bullet filler was previously unregulated.

When editing the contract, check the assembled output for restatement — `estimate:line-budget` and a quick directive-line count are cheap sanity checks.

**Optimize path settings.** `buildOptimizePdfPrompt` now receives `buildSettingsInstructions(settings, { includeEntryCountDensity: false })`. It previously received no settings at all. Entry-count targets are excluded because that path tailors a resume which already has its own structure, and a "4–5 entries" target would push the model to delete real entries.

---

## Resume builder wizard (`ResumeBuilderWizard.tsx`)

Opening `/resume` starts with a **wizard** (skip to editor anytime via **New build** in the toolbar later).

1. **Job description** — paste from company site (both paths)
2. Choose path:
   - **Optimize existing resume** — upload PDF + JD → one LLM call returns `{ baseline, optimized }`
   - **Build from repository** — choose build settings/custom conventions, then select freewrite sources from Repository (manual checkboxes or age filters)
   - **Cover letter from resume** — upload a finished resume PDF + JD → one LLM call returns the cover letter plus a faithful extraction of the PDF; both land in the editor, which opens on the letter (see [Cover letter](#cover-letter-coverletterwritingrulests-coverletterpromptts-coverletterrunts))
3. **Preview prompt** — inspect/copy the exact prompt that will be sent before generation
4. **Generate tailored resume** via Web AI (extension required)
5. **AiResultModal** — id-scoped diff + preview with JD sidebar + full post-generation renderer controls + refine/apply
6. **Editor** — inline edits; persistent Style panel; **AiPanel** for further Send PDF / improvements in linked chat

Path A sends a single PDF-attached prompt that extracts the faithful baseline and optimized resume in one response, preserving the before/after diff without a second chat send. Path B sends **freewrite source material** (repo `mode=freewrite`), saved **Education Info** records/meta, a content-selection profile from `resumeBuildStyle.ts`, and user render/style preferences from `resumeSettings.ts`. Token estimates are shown before generate. Repository builds and repository prompt preview both refresh `/api/repo` and `/api/education` immediately before prompt construction so saved UI edits are not replaced by stale wizard state.

Repository resume generation uses strict import-style JSON detection (`---JSON-START---` / `---JSON-END---`, balanced-object fallbacks, and substantive-content validation). Prompt schemas or placeholder JSON must never open an empty preview. The repository prompt has a hard one-page budget, targets 4-5 substantial entries at 2–4 bullets each (the Settings bullet range) when source quality supports it, must use saved education context rather than inventing education placeholders, and must not promote project/product URLs to personal contact links. Parser cleanup strips generated placeholder/editor artifacts such as `(edit)`, `Expected May 20XX`, and `GPA: X.XX` before content reaches the editor.

Repository is a **single warehouse** — "ongoing" is not a separate page or store. An experience/project that is still in progress simply has **no end date**, which renders as "present" and shows an *ongoing* badge on the Repository card; `RepositorySource.kind` is always `'repo'`. (The former separate Ongoing page, its `/api/ongoing*` routes, and the `ongoing_items`/`reflections` tables were removed when the two were unified.) Open prompt-quality improvements such as action-verb variety, sparse evidence-driven bolding, source-number preservation, and measured one-page compression are tracked in `next_steps.md`.

Generation does **not** lock the user into one visual template. The LLM returns `ResumeData` once; `AiResultModal`, the editor Style panel, and PDF export render that same JSON through the selected renderer.

**Incognito mode** — a checkbox on the generate step that applies to **both** Solitary and Council (both paths). When on, the extension opens the provider chat and toggles it into a **private / temporary chat before sending anything** (Claude *Use incognito*, Gemini *Temporary chat*), so the resume/JD never lands in saved chat history. If the toggle can't be confirmed active the send **aborts** rather than falling back to a normal saved chat (see [LLM response capture](#llm-response-capture-content-lljs)). The choice is persisted in `localStorage` (`resume-builder-ai-incognito`). ChatGPT is intentionally not wired for incognito. Applies only to new-chat sends; the refine loop reuses the already-incognito chat.

The optimize path upload panel is **centered**. The generate button has no decorative icon — spinner only while running.

`PipelineStatus` renders **below the Generate button** (wizard) or below `AiPanel` (editor). See [AI pipeline progress](#ai-pipeline-progress) below.

### LLM Council (`types/council.ts`, `promptDelivery.ts`, `CouncilProgress.tsx`)

A **Solitary LLM** (default) / **LLM Council** toggle on the generate step, both paths.

- **Candidates** — 2–3 providers, **duplicates allowed** (e.g. Claude + Claude; the draft angles below keep same-provider drafts apart). Default **Claude + Gemini**; adding a third slot picks an unused provider. Run **in parallel**, each in its own fresh background chat. No extension changes were needed: `background.js` already isolates every send by `requestKey(appTabId, appRequestId)`, so the wizard fires them concurrently. Repository candidates go through `sendLargePromptAndWait`, which attaches the task as a `.txt` for truncating providers (Gemini) and pastes for the rest.
- **Draft angles (repository path, `councilAngles.ts`)** — candidates no longer get an identical prompt. Slot 1 writes **JD-first for the recruiter** (select and frame work around the JD's requirements, optimise for the 10-second scan); slot 2 writes **work-first for the hiring engineer** (lead with the most impressive work, keep the technical substance, connect to the JD where real). A third slot runs the unangled prompt. The judge is told each label's angle (never the provider) and how to merge them entry by entry. The optimize path is unangled. Bulk builds use the same angles via `runJob`'s `buildCandidatePrompt`.
- **Judge** — one provider (separate chat), defaults to **Claude** (changeable in the wizard), runs after **≥2 candidates succeed**. Sees drafts labelled **A/B/C only** (`buildCouncilJudgePrompt`); the label→provider map is revealed in the UI after. For repository runs the judge also receives the **candidate source material** (the freewrite sources the drafts were built from) so it can score evidence fidelity. With no JD it scores general ATS readiness and says so in the justification. The judge is held to the **same writing contract as the candidates**, since its `final` is what ships.
- **Failure tolerance** — failures are honest; <2 successes or a judge failure → candidate-pick fallback. **Cancel** aborts app-side (`councilRunIdRef`).
- **Scoring** — one **recruiter score out of 100** per candidate plus a 3–4 line plain-prose justification, answering a single question: would a recruiter at the target company want to interview this candidate after a 10-second scan, and would an engineer respect the work on a full read. It weighs what the reader can say about the candidate after 10 seconds, how much of the strongest material (ownership, selectivity, results) is visible first, substance, and readability; JD keyword coverage is a tiebreaker only. The JSON key stays `atsScore` for snapshot compatibility. The prompt tells the judge to keep this short because writing the final resume is the task that matters. This replaced a user-editable multi-dimension rubric whose per-dimension rationales (7 × 3 candidates = 21) consumed the judge's output budget before it reached the resume; `councilSettings.ts` and both rubric editors were removed.
- **Progress** — `CouncilProgress` renders one cohesive branching tree: a trunk forks into parallel candidate branches (each a `PipelineStatus` step tracker) and converges into the judge. The merge is a node on the same spine, not a separate diagram — once ≥2 candidates finish and the judge starts, the drafts feed into the judge as packets that travel **down the spine itself** (`Rail flowing`), so the whole run animates in a single visual language. Slot status is app-driven, so capture logic stays untouched.
- **Results** — `AiResultModal` adds a Final/Candidate switcher, the per-candidate ATS score + justification, synthesis notes, per-view page-fit, and failure badges. Refine links to the judge chat. History persists a `CouncilSnapshot`.
- **Scores live on the default tab, not behind a switcher.** Both modals render an `allScores` / overview block listing every candidate's ATS score on the view they open on. The per-candidate block below it only exists while a candidate tab is selected, so before this the numbers were reachable one at a time and the landing view showed none — which reads as "the build produced no scores". If you add a score, put it on the overview too.
- **Post-apply candidate review** — after a council build is applied, the editor subtitle links to **Council build · view candidates** (`CouncilReviewModal`). It shows each candidate's resume and ATS score, the **page-fit % for every candidate** (measured live, even after one was applied), and an **Apply Candidate X to editor** button so a different draft can be swapped in at any time.
- **Capture** — `parseCouncilJudgeResponse` reads `{ scores, synthesisNotes, final }` where each score is `{ atsScore, justification }` (tolerant of numeric strings and a few alternate key names); the judge-wrapper `expects*Wrapper` gate in `content-llm.js`/`background.js` keeps the full wrapper from collapsing to its inner `final` resume.
- **`readAtsScore` also understands the retired rubric shape**, and `CouncilReviewModal` runs persisted snapshot scores back through it. Sessions saved before the migration hold the judge's raw `{ scores: {jd_alignment: 6, …}, rationales: {…} }` in the snapshot — reading `.atsScore` off those gives `undefined`, so every historical build rendered "—" and its judge analysis was invisible. They now surface as `overall_quality × 10` with the per-dimension rationales as the justification (hence `white-space: pre-line` on `.ai-council-score-rationale`). Normalize on **read**, not only on parse: snapshots bypass the parser entirely.

### Recruiter read (`recruiterRead.ts`, `RecruiterReadBar.tsx`)

After **every** wizard build is applied, the editor sends the resume as plain skim text (bold kept as `**…**`) plus the JD — **no repository material** — to a fresh chat in the provider that produced the resume, asking for a 1-2 sentence "who is this person" summary from a 10-second recruiter skim. It shows in a bar above the page, with **Re-read** and a "resume edited since" flag. Information only: nothing is rewritten from it. It runs alongside the cover letter, but waits for the letter when both use the same provider. The reply is `{ "summary": … }` between JSON delimiters; like the letter it has no dedicated capture gate and relies on the sentinel fallback. Persisted in the history snapshot as `recruiterRead`; restored or bulk sessions without one get a **Recruiter read** toolbar button.

### Cover letter (`coverLetterWritingRules.ts`, `coverLetterPrompt.ts`, `coverLetterRun.ts`)

**Two entry points.** (1) The **"Also write a cover letter"** tickbox on a repository build, described below. (2) The wizard's third path, **Cover letter from resume**: upload a finished resume PDF, paste the JD, and one send (`buildCoverLetterFromPdfPrompt`, PDF attached via `sendPdfAndWait`, so Gemini gets the locally extracted text like the optimize path) returns the letter object with one extra top-level key, `resume`, holding a faithful extraction of the PDF. `parseCoverLetterWithResumeResponse` reads both; the letter is required, the resume is best-effort. The wizard calls `onComplete` with a `coverLetterResult` and the editor applies the letter directly, opening on the cover letter view with the extracted resume beside it. Repository sources (all sendable ones) and the Education record are sent as extra material. No council, no Regenerate (rerun the wizard with the PDF instead). The payload is deliberately a flat letter object plus `resume` rather than a new wrapper, because the extension's capture gates accept a top-level letter today and a wrapper would need its own gate.

An **"Also write a cover letter"** tickbox plus its own model picker on the wizard's generate step, **repository path only** (the optimize path has no freewrite warehouse, so the letter would have nothing to say that the resume does not already say).

- **Always a single model.** There is no council variant — a letter is short enough that a judge's synthesis costs more than it returns, and averaging three drafts is precisely what flattens a letter's voice. The cover-letter council scaffolding that existed before this (`buildCoverLetterJudgePrompt`, `parseCoverLetterCouncilJudgeResponse`, `CoverLetterCouncilReviewModal`, the `CoverLetter*` council types) was removed outright.
- **Always after the final resume.** The wizard hands the editor a `CoverLetterRequest` on **apply**; `ResumeEditor` then runs it in the background against the resume that was actually applied (which, for a council run, may be a candidate the user swapped in rather than the judge's synthesis). Progress shows as a toolbar chip; the editor stays fully usable.
- **Inputs**: the final resume JSON + the same freewrite sources the resume was built from + education context + JD + today's date. The resume is supplied *so the letter does not repeat it* — the freewrite warehouse holds far more than fits on one page, and that surplus is what the letter is made of. `COVER_LETTER_RESUME_RELATIONSHIP` caps overlap at two resume items, requires each to add something the resume does not say, and states a swap test: if a sentence could be a resume bullet, cut it.
- **Format** follows a university career center guide's sample letter, minus the parts this app skips: **no recipient block, no company address, no "RE:" line**, and a fixed `Dear Hiring Team,`. Header → date → greeting → opening (3-4 sentences) → 1-2 body paragraphs tied back to the JD → closing paragraph with email/phone and an interview ask → `Sincerely,` + typed name. Prose only, one page, ~300-400 words.
- **Voice** (`COVER_LETTER_VOICE_RULES`) bans ~40 AI-tell words (tapestry, delve, passionate, thrilled, eager, seamless, testament…) plus the quieter machine tells (silently, quietly, effortlessly, leverage, harness, "not just X but Y", "whether it's", "a testament to", "I believe"…) and manner adverbs that describe *how* something was done, the four stock openings, claims of feeling, and compliments to the company; requires varied sentence openings (not every sentence starting with "I"); and forbids saying anything about the employer that is not in the job description text. Em dashes are already banned by the shared `EM_DASH_PROMPT_RULE`.
- **Readability** (`COVER_LETTER_READABILITY_RULES`) is the counterweight to the voice rules, and it is load-bearing. The voice rules optimise each sentence in isolation — *prefer short sentences*, *no transition sentences*, *don't start with "I"* — and applied together they strip out the connective tissue that makes a paragraph followable. Real output came back fully compliant and painful to read: bare orphan sentences ("I'm applying for the software engineering intern position." dropped between two unrelated ideas), 40-word sentences with nested appositives, front-loaded modifiers describing a subject that had not been named yet ("A computer science student at State University through May 2029, I've…"), and a new idea every sentence with nothing linking them. The readability rules govern how sentences *relate*: one point per paragraph, every sentence connected to the one before it, subject named before it is described, no sentence over ~35 words, never two long complex sentences in a row, and cut a whole point rather than compressing every point past readability. The "don't start with I" rule is explicitly subordinated to this — a contorted sentence is a worse tell than a repeated pronoun.
- **The self-check is two passes, readability first** (`coverLetterPrompt.ts`). The model is told outright that its first draft under these constraints will be dense and choppy, and that fixing that is a separate revision pass to run *before* the cheap compliance greps for banned words and em dashes.
- **Today's date** is passed in explicitly (`formatLetterDate(new Date())` → `August 1, 2026`) — models do not reliably know it.
- **Delivery**: the send goes through `sendLargePromptAndWait`, so **Gemini gets the task as a `.txt` via the CDP file-chooser attach** and everyone else pastes. An attach failure surfaces as a banner in the editor, never silently.
- **JD comments**: each paragraph may carry a `jdComment`, rendered by `CoverLetterWithJdNotes` in the same side panel the resume uses (`JdNotesPanel`). The panel is a **sibling** of `.resume-page-wrapper`, never a child — `pdf.ts` resolves its export root by climbing to that wrapper and measures fit from the page's own `scrollHeight`, so notes inside the page would both print and corrupt the fit reading.
- **Editor**: a `[ Resume | Cover letter ]` switcher in the toolbar. The letter is inline-editable, has its own undo history, its own one-page fit badge, and **Download letter** (same text-PDF writer, same auto-compress-then-refuse-to-spill logic). `docView` also decides which document owns the global ⌘Z, since both state hooks register a handler. The Web AI panel and the renderer **Format** picker are hidden on the letter view — both are resume-only (note: their CSS sets `display`, which outranks `[hidden]`, so each needs an explicit `[hidden] { display: none }` rule).
- **Typography is derived, not stored.** `deriveCoverLetterRenderSettings(resumeSettings)` maps the resume's fonts/sizes/weights/intensity and horizontal margins onto the letter, so the two documents in one packet match — the guide's first checklist item is "Consistent with your resume, e.g., header, font?". Line height and vertical margins get floors (prose needs more leading than bullets; a 350-word letter should not sit jammed at a dense resume's top margin) and paragraph spacing is fixed. There is no separate Style panel.
- **Contact profile** (`contactProfile.ts`) is the single authority for name/email/phone/LinkedIn/GitHub in **both** headers. `ensureContactProfile` appends any missing fact after parsing — for the letter always, and for the resume only on **generated** output (`normalizeAiResume(..., { enforceContactProfile: true })`). A faithful transcription — a PDF import, or the optimize path's `baseline` — is deliberately left alone, since adding a link the source document never had would corrupt the before/after diff.
- **History**: `HistorySessionSnapshot` carries `coverLetter` + `coverLetterSession` (only once a real letter exists, so saved sessions never carry the empty-state template).

### Diff viewer (`resumeDiff.ts` + `ResumeDiffView.tsx`)

Compares before/after resumes by **stable ids** (`section.id`, `entry.id`, `skill.id`) — **not** array position. Bullet-level changes are matched semantically within each entry so deleted/reordered bullets show as removals/additions instead of being hidden by index shifts. Reordering Projects above Experience must **not** show false "replaced" bullets. The diff also suppresses the legacy experience schema flip where older baselines stored role in `entry.title` and company in `entry.subtitle`, while the current renderer stores company in `entry.title` and role in `entry.subtitle`; that pure title/subtitle swap is not a content change.

Each change card shows:
- **Changed** — red strikethrough "was on resume" + green "now on resume"
- **Added** / **Removed**
- **AI note** — blue dashed box, explicitly *not printed on the PDF*

---

## Resume editing (`ResumeDocument.tsx`)

- **Renderers**: `classic` and `keyword` (labelled *Bold emphasis*) live in `resumeSettings.ts`; both render the same `ResumeData`, and differ only in whether the model's `<strong>` spans are shown
- **Template baseline**: LaTeX-style single column, US Letter (8.5×11in)
- **WYSIWYG**: `EditableText` (`contentEditable`) on all fields; supports inline HTML (bold, italic, font, size)
- **Post-apply style switching**: the editor toolbar's **Style** button opens a persistent style panel after generation/apply. Changing template, fonts, sizes, spacing, margins, text/rule intensity, CSS weight values, or bold/italic/uppercase toggles updates the live preview and `#resume-export`. To keep the many controls readable they are grouped into tabs — **Template** (template picker), **Type** (fonts, sizes, line height, weights), **Spacing** (margins + section/entry gaps), **Sections** (drag-to-reorder section order), and **Emphasis** (bold/italic/uppercase toggles + text/rule intensity). The tab bar stays pinned while only the active panel scrolls.
- **High-level style settings**: `ResumeRenderSettings` controls body/name/section-heading fonts, name/heading/body/bullet sizes, line height, page margins (top/right/bottom/left in inches), section/title-to-content/entry spacing (points), text intensity, rule intensity, body/bold/strong CSS weight, section heading bold/italic/uppercase, entry title bold/italic, subtitle italic, date bold/italic, skill-label bold, section order/headings, min/max bullets per experience (default **2–4**), and generation notes. `SETTINGS_VERSION` migrates saved settings when a shipped default must reach existing users; it currently resets only the bullet min/max.
- **Removed template**: stack-beside-names is intentionally gone. Do not reintroduce a layout that places a detected tech stack beside the entry name.
- **Editor toolbar layout**: the top toolbar is a wrapping flex layout. Controls must wrap to a new row before they overlap; do not use a fixed grid that lets center/right controls collide.
- **Editor chrome color**: after the editor opens, the toolbar, Style panel, and Web AI panel use the neutral/warm app palette. Do not reintroduce purple/blue panel backgrounds or purple primary actions in the editor chrome.
- **Bold emphasis is model-chosen.** There is no keyword-terms setting and no post-generation highlighting pass. The model emits `<strong>` inside bullet text — normally exactly one 3–8 word span per bullet — that is the bullet's headline: the outcome with its number, or the name of the thing built when that is the impressive fact, then a supported job-description term. Bare tool names (React, AWS, Docker) are never bolded on their own; reading only the bold spans should give a list of accomplishments, not a stack. Never in entry titles, dates, section headings, or skill labels, since the renderer already weights those. Bold only: no color, background, highlight, or PDF annotation styling.
- **Classic hides emphasis without discarding it.** `.resume-page--classic strong { font-weight: inherit }` renders the tags flat; the tags stay in the JSON, so switching to *Bold emphasis* surfaces the model's choices unchanged. This is deliberately CSS rather than a JS strip — `EditableText` writes `displayValue` back to state on edit, so stripping in JS would silently destroy the tags the first time a bullet was touched. The PDF exporter reads computed `font-weight` off the same DOM, so export follows the preview with no second code path.
- **The removed approach**: a `keywordTerms` list plus an `emphasizeKeywords` regex that bolded literal matches after generation. It made emphasis depend on a hand-maintained word list rather than on the job description, and it is gone from settings, the renderer, and all four UI inputs.
- **Editor chrome**: `+ link`, `+ bullet`, `+ entry` buttons are `position: absolute` in the gray margin — they do **not** appear in PDF export
- **`+ bullet` positioning**: sits at `bottom: 22px` on `.resume-entry` so it doesn't overlap the `+ entry` button which sits at `bottom: 0` on `.resume-section`

### Settings page (`SettingsPage.tsx`)

`/settings` edits global defaults persisted under `resume-render-settings`. These defaults seed the wizard, result preview, editor Style panel, History snapshots, and PDF export. Wizard build settings can override them for a single generation; applying the generated resume carries those selected render settings into the editor. Min/max bullets per experience are prompt constraints for repository generation; they do not replace the editor's local one-page fit check.

The Settings page includes a scaled live resume preview using the same `ResumeDocument` renderer as export, so section order, margin, font, line-height, spacing, bold/italic, intensity, weight, and template changes are visible before generation. Numeric labels include units: font and spacing controls are points, margins are inches, intensity is percent, CSS weight is unitless, and line height is a unitless multiplier.

Bounded numerics render as **sliders** (live value chip + min/max endpoints); bullet counts use `<Stepper>`, which disables at the bounds. Both replaced number inputs and let the typed-draft workarounds be deleted from `SettingsPage`, `ResumeRenderSettingsControls`, and the bullet-count handlers.

**This page is the only writer of `resume-render-settings`.** The editor's Style drawer is per-resume and never persists globally — see the design-system notes above.

Section order is controlled by the **Section order** list in Content Defaults. Rows are draggable via the grip icon, with the comma-separated input kept as a fallback for adding/removing/renaming headings. The setting affects both future generation prompts and post-generation rendering/export: `ResumeDocument` sorts display sections by the saved order without mutating the underlying resume JSON. Unknown/custom sections remain after known ordered sections in their original relative order.

All controlled number inputs keep a temporary typed draft so clearing and replacing a number does not immediately snap to clamped values while the user is mid-edit. This applies to Settings, wizard pre-generation typography fields, generated-result modal controls, and the editor Style panel. Sanitized values are still saved back through `mergeResumeRenderSettings` when the draft is valid and synced back on blur/reset.

The shared render-settings controls used in wizard previews, generated-result modal, and editor Style panel include small italic `i` info dots for template, fonts, numeric fields, and bold/italic/uppercase toggles. Hover or click the dot to see a plain-language explanation of what that control does. The tooltip is rendered only while open (hover or click), closes on mouse-leave/blur, and is announced to screen readers via `role="tooltip"` and `aria-describedby`.

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

The workspace is centered as one unit: `[rail][8.5in page][optional 308px JD panel]`. The format toolbar spans **only the 8.5in page column** (plus rail offset), not the JD sidebar width.

The rail width is **`--resume-rail-width` on `.editor-canvas-stack`, and that is the only place it may be written** (currently 76px). It positions the page-fit gauge, the canvas width, and the format toolbar offset, and `.resume-page-wrapper` in `ResumeDocument.css` reads the same variable (falling back to 130px for pages rendered outside the editor canvas, e.g. the result and candidate-review modals). It was previously duplicated as a literal in both files; changing one dropped the fit gauge on top of the résumé. The rail only has to clear the row-delete controls at `-34px` and the gauge at `left: 4px` — the add-controls that once needed 130px now sit with their content.

### Resume PDF via LaTeX (`frontend/src/utils/latex.ts`, `POST /api/latex/pdf`)

**Download PDF on the resume compiles real LaTeX.** `buildResumeLatex(data, settings)` turns the editor's `ResumeData` plus its render settings into a self-contained Jake's-Resume-style `.tex` (geometry margins, `times`/`helvet`/`palatino` from the body font, exact body size and baseline from the size and line-height settings, `titlesec` headings with the section spacing values, `enumitem` lists, `hyperref` links, bold/italic flags mapped to `\rsTitle`/`\rsSub`/`\rsDate`/`\rsLoc`/`\rsSkill` macros). Section order comes from `sectionOrder.ts`, the same module the on-screen renderer uses. Inline `<strong>`/`<em>`/weight-styled `<span>` become `\textbf`/`\emph`; everything else is escaped (`&`, `%`, `_`, `#`, en/em dashes, ×, ·, arrows, curly quotes).

The backend writes the source to a temp dir under `~/.resume-builder/latex-build/`, runs `tectonic -X compile --keep-logs`, reads the page count from the engine log (`Output written on … (N pages`), and returns the PDF with an `X-Page-Count` header. A multi-page result is downloaded and the editor tells you the count rather than refusing. **Tectonic runs XeTeX, whose default `TU` font encoding silently substitutes the Type 1 Times fonts (no bold, no italic); the generated preamble loads `[T1]{fontenc}` before the font package for exactly that reason.**

The **LaTeX** toolbar button opens `LatexSourceModal`: the exact source Download PDF compiles, with Copy, Download `.tex`, and **Open in Overleaf** (a form POST of `encoded_snip` to `overleaf.com/docs`, which creates a project from the snippet). Editing in Overleaf is a one-way trip: the editor keeps its own JSON, so edits made in LaTeX do not flow back.

The editor preview is still the HTML renderer. TeX packs slightly tighter than Chrome, so the page-fit badge (DOM-measured) is a conservative estimate and the compile's page count is the truth.

### DOM text-PDF writer (`frontend/src/utils/pdf.ts`)

Still used for the **cover letter** download, the PDF blob attached to AI sends (`generateResumePdfBlob`), and page-fit measurement. It must create a real text PDF. Do not reintroduce `html2pdf`, `html2canvas`, canvas screenshots, full-page image export, or any other rasterized PDF path.

1. Export targets `#resume-export` → `.resume-page-wrapper`
2. Before writing, the wrapper is made visible at the 8.5in page width so DOM layout measurements are stable
3. `pdf.ts` measures the rendered page against an 8.5x11 page and reserves a `SAFE_FILL_RATIO` (98%) bottom margin so line-box atomicity can't spill the last line onto page two. Status is `under` / `fit` / `over`, plus a `safe` flag (≤98%) surfaced as a **"Tight fit"** badge for the 98–100% zone. **Download letter** auto-compresses near-full and small-overflow letters (loops the fit moderator, re-measuring each pass until usage drops back under the safe line) and refuses to export a letter that still spills. The resume download no longer uses this loop: it goes through LaTeX (above) and reports the compiled page count instead.
4. `pdf.ts` walks rendered text nodes and section-rule elements, then writes PDF text operators and vector lines directly
5. Standard PDF fonts (`Times`/`Helvetica`, with regular, bold, italic, and bold-italic variants selected from the rendered `font-weight` and `font-style`) preserve selectable text without embedding a page image
6. `generateResumePdfBlob()` for AI send and `exportResumeToPdf()` for download share the same text-PDF path
7. Verification for any generated resume PDF: extractable characters should be nonzero, embedded page images should be zero, ATS/parser tools should not see a blank resume, and visual spacing/weight must be checked on the downloaded PDF itself

Current caveat: the editor preview and downloaded PDF now render weight through the same mechanism — both resolve `font-weight` to a real font face (Times-Roman vs Times-Bold, italic variants likewise). The previous synthetic `-webkit-text-stroke` weight reinforcement was removed because it was invisible on screen but visible at vector resolution in the PDF, which made weight changes appear in the download but not the preview. Remaining limitation: built-in PDF fonts only ship regular and bold weights, so intermediate CSS weight values (e.g. a body weight of 500) collapse to the nearest available face in both preview and download. True fine-grained weight parity requires embedding/subsetting a variable font, or moving to a browser/print PDF path that preserves selectable text and page-fit guarantees.

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

`content-llm.js` reports progress every **1s** while waiting for model activity. `useAiBridge` coalesces repeated `waiting` events; the active milestone label appears in the status line under the step circles. Waiting labels distinguish "model is generating" from "provider tab is in the background and generation has not visibly started yet"; the latter is a stale-status/throttling hint, not a response-capture failure.

ChatGPT background capture uses Chrome DevTools Protocol focus emulation during active captures, plus an event-driven `MutationObserver` path and immediate return of complete parseable JSON. The CDP path uses `Emulation.setFocusEmulationEnabled` and `Page.setWebLifecycleState`, and must not use tab activation or `Page.bringToFront`. This is the confirmed fix for the hidden-tab ChatGPT response materialization bug: it lets ChatGPT finish/render the response while the provider tab stays backgrounded. Diagnostics from `cdp_wake_started`, `content_wait_sample`, `content_capture_chatgpt_observer_parseable`, and `backup_poll_sample` are the next source of truth. Do **not** reintroduce provider-tab activation/focus as a workaround; that UX is explicitly disallowed.

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

New-chat sends (`SEND_PDF`, `SEND_PROMPT`) also carry an optional **`incognito`** boolean. It is threaded flat (like `forceNewChat`) through `useAiBridge` → `content-app` → `background.js` `startSend*`/`handleSend*` → the `INJECT_PDF` message → `content-llm.js`, where the toggle is clicked before typing. `SEND_IMPROVEMENT` does **not** carry it — it reuses the chat that is already incognito.

### LLM response capture (`content-llm.js`)

1. Snapshot baseline assistant text before submit
2. Watch assistant DOM mutations and use a timer wake only as a backup for providers that need it
3. Detect streaming via stop button or `[data-is-streaming="true"]`
4. **Only return when JSON is complete** — prefers complete `---JSON-START---` / `---JSON-END---` payloads and otherwise waits for a closed ` ```json ` fence
5. **ChatGPT** — prefers `<pre><code>` content from latest assistant turn and returns immediately once the payload is complete/parseable
6. **Gemini** — the Council **judge** `.txt` **and repository candidate `.txt`** both use the real **CDP file-chooser attach** (see the Gemini file attach note below and `next_steps.md`); Gemini **candidate PDF** sends (the optimize path) still convert locally through `/api/pdf/markdown` and send as a text prompt. Claude/ChatGPT use real PDF attachments throughout.

Submit verification must not trust the pre-submit composer node after click/keyboard/form submit. Claude can accept the prompt, clear or replace the live composer, and continue generating while a stale DOM reference still contains the old prompt. `verifyMessageSubmitted()` re-queries the live composer, polls for streaming/rendered-prompt/composer-cleared evidence, and checks for late parseable responses before surfacing a send-button-disabled error.

Optimize-PDF capture is stricter than generic resume capture: when the submitted prompt requests the `baseline`/`optimized` wrapper, both `content-llm.js` and the background backup poller reject plain nested resume objects even if they are otherwise valid `ResumeData`. This prevents the app from receiving a section-level or optimized-only object and showing a false "missing wrapper" error after Claude generated the correct delimited wrapper.

**Incognito / temporary chat (`enableIncognitoChat`).** When a send carries `incognito:true`, `content-llm.js` clicks the provider's privacy toggle right after the composer is confirmed ready and **before** any attach/type/submit, then re-waits the composer (toggling re-renders it and clears any attachment). Selectors + confirmed "on" markers live in `INCOGNITO_TOGGLE_SELECTORS`:
- **Claude** — click `button[aria-label="Use incognito"]`; confirmed by the exit/turn-off control appearing (or a URL change / the enable button disappearing).
- **Gemini** — click `button[aria-label="Temporary chat"]`; confirmed by the `<gem-icon-button>` wrapper gaining a **`temp-chat-on`** class. The inner button's own `aria-label`/`aria-pressed` do **not** change, and the "Turn off temporary chat" text is a `<div>` (not a button label) — an early build checked only the button's own ARIA and false-aborted even though the click worked.

After clicking it polls the marker (or URL change / enable-button-gone) for ~4s. If it can't confirm privacy is active it **throws**, aborting the send — it never silently sends resume data into a normal, saved chat (privacy is a hard constraint). Emits an `AI_DEBUG` `content_incognito_toggle` event with the outcome. Markers are provider-versioned UI and will drift; re-diff before/after a real toggle click to re-anchor.

**Fragile area:** LLM DOM changes frequently. Selectors in `PROVIDER_SELECTORS` and upload-button logic will need updates when providers ship new UI.

**Gemini file upload — content-script attach fails; CDP file-chooser interception is now wired in (Gemini judge `.txt`).** Synthetic-event/content-script attach cannot upload to Gemini: the "+" menu opens but exposes no reachable `<input type=file>`; "Upload files" opens the **native macOS file picker**, which synthetic clicks and drag/drop cannot feed. The fix is **CDP file-chooser interception**: `Page.setInterceptFileChooserDialog` + trusted `Input.dispatchMouseEvent` clicks on "+" then "Upload files" + `Page.fileChooserOpened` (returns the input's `backendNodeId`) → `DOM.setFileInputFiles({backendNodeId, files:[absPath]})`. `setFileInputFiles` reads from **disk by absolute path**, so `POST /api/tmpfile` writes the `.txt` and returns its path; `useAiBridge.sendPromptAsFileAndWait` sends `SEND_PDF { geminiFilePath }`; `background.js` runs `attachGeminiFileViaCdp` in `startSendPdf` then captures with `skipAttach:true`. **Correction to an earlier assumption:** the chooser only opens for the **active tab**, so the attach **must briefly foreground the Gemini tab** (it is *not* focus-agnostic). This covers the Council **judge** and repository **candidates** (both send a large `.txt`); on any attach failure the app falls back to the paste path **and now says so** — `sendLargePromptAndWait` reports the extension's verbatim error and the wizard shows a *"Prompt was pasted, not attached"* banner with the `gemini_attach_*` trace, because a silent fallback into a truncating composer produces a broken resume that looks like a healthy run. **Do not route Gemini through the content-script attach as a "fix"** — it was tested and fails in background *and* foreground tabs; CDP interception is the only working mechanism. Gemini **candidate** PDFs stay on local `/api/pdf/markdown` extraction (no foreground). See `gemini-attach-test/` (the harness) and `next_steps.md`.

ChatGPT background response capture was changed in v1.5.20 to avoid the hidden-tab stability-timer dependency: the content script observes assistant DOM mutations and returns complete parseable JSON immediately. Diagnostics then showed ChatGPT did not materialize the full JSON while hidden, so v1.5.21 added a CDP wake that emulates focus/lifecycle during capture without activating the tab. This CDP wake has been confirmed to fix ChatGPT background response capture, and Gemini text sends keep the same wake for anti-throttling after local PDF-to-markdown extraction. MV3 alarms/storage backup polling and `CAPTURE_NOW` fallback scraping still exist. Earlier attempts to focus the provider tab or use WebAudio were rejected/failed: focusing violates the UX requirement, and WebAudio was blocked by Chrome autoplay policy and temporarily regressed prompt/PDF send by blocking the capture flow.

---

## Repository page (`RepositoryPage.tsx`)

Think of this as a data warehouse — not everything here ends up on a resume. Two entry modes:

- **Resume-optimized**: bullet-point format with action-verb tips shown inline
- **Freewrite**: raw narrative, will be AI-optimized later

Full inline editing: click the pencil icon on any expanded entry to edit all fields in place.

### Import (`RepoImportPanel.tsx`)

**Import** on Repository and Education opens a panel with two paths:

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
  - Entries with no end date (or marked Present/Current) are stored as ordinary repo items with a null end date — i.e. ongoing — no separate cross-linking step
- **Contradictions require review** — mutually exclusive facts are paused in a review table. Choosing **Existing** or **Incoming** applies the selected field; repository conflicts can use LLM-provided clean freewrite variants for each choice, so conflict notes are not saved into the warehouse text.
- **Diagnostics are programmatic** — import failures surface extension debug events in the panel with a single copy action. Do not ask the user to paste console snippets for normal debugging.

Requires Chrome extension (v1.5.16+) for PDF send, LinkedIn scrape (`SCRAPE_URL` bridge message), background capture polling, and import diagnostics.

Each of Repository, Education, and History has a **Delete all** button (with confirmation) that clears that tab's data via collection `DELETE` routes (`/api/repo`, `/api/education`, `/api/history`).

---

## Education page (`EducationPage.tsx`)

Separate from the experience/project warehouse. Stores:

- **School records** — degree, major, GPA, start date, graduation date, location, coursework/honors/notes. Both dates matter: the resume always renders a school as a `Mon YYYY – Mon YYYY` range, so a missing start date is derived (August, program length before graduation) rather than left off
- **Skills & other notes** — languages, tools, certifications, awards (imported from `profile.skills_note` / `profile.other_fixed_facts`)

Import from Repository/Education routes education to this page, not the repository.

Skills/notes are **saved automatically on import**. The Skills & other notes summary is collapsible like school records; use **Edit notes** to change the saved meta fields.

---

## Ongoing work (merged into Repository)

There is no separate Ongoing page anymore. An experience or project that is still in progress is just a **Repository entry with no end date** — it renders as "present" and carries an *ongoing* badge on its card. Leave the end date blank to mark something ongoing; set it to mark it finished. The former Ongoing page, its dated-reflections/compile-to-freewrite flow, the `/api/ongoing*` routes, and the `ongoing_items`/`reflections` tables were all removed in the unification.

---

## History page (`HistoryPage.tsx`)

Autosaved **editor sessions** — not the same as `resume_versions` (AI-apply snapshots).

- There is no Save button. Every editor state change is written to History on its own: resume JSON (incl. JD match comments), job description, linked AI session, JD sidebar toggle, zoom, AI edit prompt, `renderSettings` (so reopen restores the template/style controls used by preview/export), council snapshot, and the cover letter once one exists.
- The first change after a build (or after **Skip to editor**) **creates** a session titled with the local date and time, `YYYY-MM-DD HH:mm`, and puts `?session=<id>` in the URL; later changes **update** that session (UTC `created_at` / `updated_at` on server). Writes are debounced 1.2s after the last edit, serialized (a change that lands mid-write queues one follow-up write), and skipped when the snapshot is byte-identical to the last one written.
- Opening a session from History marks its restored state as already saved, so merely viewing it neither rewrites it nor bumps it to the top of the list.
- The toolbar shows the autosave status (**Autosave on / Saving… / Saved HH:mm**); a failed write turns it into a **Retry save** button with the error in its tooltip.
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
| Image-only / ATS-blank PDF | Canvas/html2pdf raster export flattened the page into one image | Use the text-PDF writer in `pdf.ts`; verify extractable text > 0 and page image objects = 0 |
| 2-page PDF | Editor controls in document flow | Controls are `position:absolute`; no `min-height:11in` on page |
| Gemini file upload failed (content-script) | Gemini's "+" → "Upload files" opens the native OS file picker; no `<input type=file>` is reachable for synthetic events or drag/drop | **Judge + repository candidate `.txt`:** CDP file-chooser interception (`/api/tmpfile` → `SEND_PDF{geminiFilePath}` → `attachGeminiFileViaCdp` → `setFileInputFiles`), briefly foregrounding the Gemini tab, with a **reported** paste fallback. **Candidate PDFs (optimize path):** local `/api/pdf/markdown` text fallback (no foreground). Claude/ChatGPT keep PDF attach. See `next_steps.md` |
| Gemini pasted the prompt instead of attaching | The CDP attach threw and the app fell back to pasting, which truncates | The wizard now shows a *"Prompt was pasted, not attached"* banner with the extension's error and the `gemini_attach_*` trace. `no fileChooserOpened` = clicks landed but no chooser opened: confirm the tab foregrounded and that DevTools is not attached to it. Restart the backend first — it doesn't hot-reload and serves `/api/tmpfile` |
| "LLM returned invalid JSON" | Response captured before fence closed | Wait for full reply; retry or send improvement |
| "Send button stayed disabled" after provider generated anyway | Submit verifier read a stale pre-submit composer node | Re-query live composer, poll for streaming/rendered prompt, and accept late parseable response evidence in `content-llm.js` |
| Stale "Waiting for response" while provider is backgrounded | Provider has not visibly started generation in the hidden tab, or the UI throttled until the provider tab was viewed | Surface the background-tab waiting label; only treat as detection failure if generation finishes and capture still fails |
| ChatGPT response appears in the provider tab but app does not receive it until the user switches to ChatGPT | Hidden ChatGPT did not materialize the full JSON DOM until focus, even though extension/content/backup polling kept running | Fixed in v1.5.21: attach CDP during ChatGPT capture and send focus/lifecycle emulation commands without activating the tab. Keep background-only UX. Do not activate/focus ChatGPT or use `Page.bringToFront`. Use diagnostics from `cdp_wake_started`, `content_wait_sample`, `content_capture_chatgpt_observer_parseable`, `backup_poll_sample`, and `content_keepalive_rtc_*` if it regresses |
| Diff viewer shows company/title swaps as changes after company-first renderer migration | Older baselines stored role in `entry.title` and company in `entry.subtitle`; current renderer uses company-first `entry.title` and role in `entry.subtitle` | `resumeDiff.ts` suppresses pure legacy title/subtitle swaps for same-id experience entries while still showing real title, company, date, location, bullet, and note edits |
| Repository edits not sent to LLM | Wizard used cached source arrays loaded before the user saved edits | Repository generation refetches repo and education immediately before building the prompt |
| Numeric Settings input jumps while typing | Controlled input saved through clamping/rounding on every keystroke | Keep a typed draft for each number input and sanitize on valid values/blur |
| Need to inspect LLM input before spend | Prompt was built only inside the send path | Wizard has **Preview prompt**, using the same fresh prompt path as generation |
| Need to reorder sections after generation | Section order was prompt-only / implicit in generated JSON | Settings has a draggable **Section order** list; renderer/export applies it post-generation without mutating resume JSON |
| Generated resume has `(edit)` / fake GPA / fake contact | Prompt allowed editable placeholders or education/contact context was missing | Repository generation includes `/api/education`, prompt forbids visible editor notes, parser strips known placeholder artifacts |
| Generated resume omits education | Wizard only sent repository freewrite | Repository generation now sends saved Education Info records and meta notes with the prompt |
| Applied resume cannot change template/style | Style controls existed only before generation | Editor toolbar **Style** panel changes renderer/fonts/sizes/toggles after apply and drives PDF export |
| Downloaded PDF truncated at bottom | Export clipped text outside the single page without warning | Editor shows under/fit/tight/over one-page status; Download auto-compresses near-full/small-overflow resumes to the safe fill line and blocks only when content genuinely can't fit |
| Editor says "Fits 1 page (100%)" but the PDF is two pages | The fit threshold allowed ~100.5% as "fit", and line boxes can't split — so the last line spilled to page two | `pdf.ts` flags any measured overflow as `over` and reserves a 98% `SAFE_FILL_RATIO`; the badge shows **"Tight fit"** for 98–100% and Download compresses it under the safe line before rendering |
| Resume is barely over one page | Small overflow can often be solved by layout, not content deletion | Download loops deterministic small-overflow fit tweaks (up to 105% usage) until usage is back under the 98% safe line; larger overflow requires content edits/compression |
| Fit success message covers Web AI panel | Toolbar status was positioned as an absolute toast under a wrapping toolbar | Keep status messages in toolbar flow and ellipsize long text |
| Optimized resume diff shows additions but hides removals, or summary counts look wrong | Missing faithful baseline, bullet deletions/reorders were compared by raw index/id, or summary counted cards rather than red/green text blocks | Optimize-PDF responses must include both `baseline` and `optimized`; bullet diffs match within each entry and show unmatched baseline bullets as removed; summary counts now count actual `before`/`after` text blocks so a changed bullet contributes one added and one removed line |
| "Technical Skills" heading has a massive gap in downloaded PDF | The text-PDF writer emitted each non-justified word as a separate absolute-positioned text object | PDF export now groups normal line text into contiguous chunks; verify downloaded PDF headings, not just browser preview |
| Downloaded PDF font is too dark/heavy | PDF text weight was faked with a synthetic `-webkit-text-stroke` that was invisible on screen but visible at vector resolution in the PDF, and `pdf.ts` ignored `font-weight` so bold text was rendered as stroked regular text | `pdf.ts` now honors `font-weight` and selects the real bold/bold-italic PDF font faces; the synthetic text-stroke was removed from preview and export so both render weight via real fonts |
| Preview and downloaded PDF weight do not look the same | Preview resolved `font-weight` to real browser fonts while the PDF writer ignored `font-weight` and faked weight with a synthetic stroke (sub-pixel on screen, visible in the PDF) | Both paths now resolve `font-weight` to the same real font faces; intermediate weights still collapse to the nearest available face until a variable font is embedded |
| All settings info tooltips open at once and cover the inputs | `ResumeRenderSettingsControls.css` used a descendant selector `.resume-settings-controls__field span` that matched the tooltip `<span>` nested inside each field and forced `display: flex`, overriding the `[hidden]` attribute's `display: none` so every tooltip was always visible | Selector narrowed to `.resume-settings-controls__field > span` (direct child only); the tooltip is conditionally rendered only while open and carries an explicit `display: block` |
| A coloured vertical strip runs down the résumé | The page-fit gauge is positioned from `--resume-rail-width`, but `.resume-page-wrapper` had its own hardcoded copy of the same number. Changing one moved the page and left the gauge inside it | Both read `--resume-rail-width` now. Never write the rail width as a literal in either file |
| Settings tooltip is cut off at the panel edge, or a stray horizontal scrollbar appears | The tip was anchored to the 14px `.info-dot` with a fixed max-width, so right-column fields overflowed. The grid is `auto-fit`, so there is no fixed column to flip against. `overflow-y: auto` also computes `overflow-x` to `auto`, producing the scrollbar | Tip is anchored to the label row (`left: 0; right: 0`) so it is bounded by the field; drawer body sets `overflow-x: hidden` explicitly |
| Purple/blue editor panel returned | `AiPanel.css` had its own hardcoded slate/purple colors outside the toolbar CSS | Keep `AiPanel.css`, `ResumeEditor.css`, and `FormatToolbar.css` on the neutral/warm palette; verify on an actual editor session |
| Top toolbar controls overlap | Fixed grid columns let toolbar center/right groups collide at wide-but-crowded widths | Toolbar uses wrapping flex layout with constrained select width; verify with a saved session and JD notes visible |
| Format dropdown does nothing | No text selected, or selection lost on focus | Highlight text first; use dropdown after selection is saved |
| Step tracker jumps ahead | Extension fires duplicate `sent` events | Milestone logic in `aiPipeline.ts` — only advance on completion signals |
| HistoryPage.css HMR error | Old CSS file was deleted, Vite cached the import | Hard refresh (`Cmd+Shift+R`) |
| Import does nothing | Extension not reloaded after update | Reload extension v1.5.16+ + refresh app |
| Provider tab steals focus during import/generate | Extension used to activate the provider tab before send | v1.4.6+ keeps provider sends in background; do not activate Claude/ChatGPT/Gemini tabs during normal sends |
| Import prompt only sends after visiting provider tab | Hidden-tab composer/button state lagged during import sends | v1.4.8+ writes to one composer instance, avoids false prompt-readback failures, and tries keyboard/form submit fallbacks before waiting on the send button |
| Claude finishes import but dashboard never merges | Extension missed the rendered JSON or app parser accepted the wrong candidate | v1.5.16+ uses explicit JSON delimiters, backup polling, real-payload validation, and app-copyable diagnostics |
| Repo import response not captured | Extension only detected resume JSON (`sections`/`contact`), not warehouse JSON (`entries`) | v1.4.4+ accepts both schemas |
| Delete all does nothing | Old `/all` routes hit `/:id` with id `"all"` | Restart API server; use collection routes (`DELETE /api/repo`, etc.) |
| Education skills not saved after import | `PATCH /api/education/meta` was shadowed by `/:id` route | Fixed — meta route registered first; import saves skills/notes directly |
| LinkedIn import empty | Not logged in or profile not fully loaded | Log into LinkedIn in Chrome, retry URL |
| Import duplicated a repo entry | Re-import of the same experience/project | Merge-by-identity skips duplicate freewrite text; empty metadata fields only fill, never overwrite |

---

## Scripts

```bash
npm run dev       # API server (port 3001) + Vite dev server (port 5173) — use this
npm run dev:ui    # Vite only (no API — repo/history features won't work)
npm run server    # API server only
npm run estimate:line-budget # estimate current render characters per line
npm run build     # tsc + vite build → dist/
npm run lint      # ESLint
```

---

## Tech stack

- **React 19** + TypeScript + Vite 8
- **react-router-dom v7** — client-side routing
- **Express 5** + **better-sqlite3** — local API server (`backend/index.cjs`, CommonJS)
- **Custom text-PDF writer** (`frontend/src/utils/pdf.ts`) — selectable client-side PDF export/send
- **lucide-react** — icons
- **concurrently** — runs API + Vite together
- **Chrome Extension MV3** — AI bridge
- No cloud backend, no LLM API keys

---

## Guidance for future agents

### Safe to change

- `ResumeDocument.css` / canvas layout in `ResumeEditor.css` — toolbar is 8.5in wide above page; test PDF export after
- `resumeFitModerator.ts` — deterministic layout-only small-overflow fitting; keep it conservative and re-measure after applying
- PDF typography parity — preview and downloaded PDF now resolve `font-weight` to the same real font faces; remaining gap is intermediate weights (e.g. 500), which collapse to the nearest available face until a variable font is embedded
- `scripts/estimate-resume-line-budget.mjs` — heuristic line-budget estimator for prompt/layout tuning; renderer measurement remains source of truth
- `FormatToolbar.tsx` / `formatSelection.ts` — selection must be preserved for dropdowns
- `JdNotesPanel` highlight uses `data-jd-anchor` on `ResumeDocument` — keep ids in sync with `jdNotes.ts`
- Prompt wording in `aiPrompt.ts`
- Pipeline milestone mapping in `aiPipeline.ts` — must stay aligned with `startPipeline()` variants in wizard/AiPanel
- Default resume content in `defaultResume.ts`
- Token estimate heuristic in `tokenEstimate.ts`
- Page stubs: `KnowledgePage.tsx` — placeholder
- `RepoImportPanel.tsx` / `repoImport.ts` — explicit `merge_target_id` imports replace repo freewrite with the LLM's coherent merged version; fuzzy local matches still append
- `historySessions.ts` / `history_sessions` table — snapshot shape must stay aligned with `ResumeEditor` autosave/load

### Change with care

- `pdf.ts` text positioning/extraction — easy to break selectable PDF output
- `content-llm.js` selectors and upload flows — test on all three providers after changes
- `content-scrape.js` + LinkedIn DOM — profile layout changes frequently
- `parseResumeResponse.ts` — must stay aligned with extension capture logic
- `resumeDiff.ts` — match by stable ids and semantic bullet matching; never compare by section/entry index
- `useAiBridge` message protocol — must stay in sync with the extension
- `ResumeData` schema — update prompt, parser, and normalizer together
- `backend/index.cjs` schema changes — better-sqlite3 won't auto-migrate; handle manually or add migration logic
- Add-control rail placement — `+ bullet` is anchored LEFT (at the bullet indent) and `+ entry` / `+ skill` are anchored RIGHT, inside their own hover target. Hovering an entry also hovers its section, so both are visible at once and their anchors nearly coincide on the last entry of a section; the horizontal split is what keeps them from overlapping. Don't collapse them onto the same edge.

### Do not do without user request

- Add API-key-based LLM calls (explicitly rejected)
- Commit secrets or `.env` with keys
- Inline script injection in extension (CSP blocks it)
- Put JD comments inline on the resume page (sidebar only; hidden in PDF)
- Put editor controls or format toolbar inside `.resume-page` document flow
- Move the API server to ESM (`"type": "module"` in package.json would break `backend/index.cjs`)

### Pages not yet built — intended design

**Knowledge page** (`/knowledge`): Notes and reference material that inform resume writing. No design specified yet.

**Future History enhancements:** timeline of repository additions, or browsing `resume_versions` AI snapshots — not in current History UI.

### Testing checklist

1. Edit resume inline → undo → auto-save survives refresh
2. Download PDF → compiled by Tectonic from the generated LaTeX; single page (a multi-page result is downloaded and flagged), text selectable, links clickable. **LaTeX** button → source shown, Copy / Download .tex / Open in Overleaf work
3. Reload extension → refresh app → Bridge ready
4. Wizard: optimize PDF with JD → one provider send returns baseline + optimized preview; step tracker advances correctly
5. Wizard: Preview prompt → repository path refetches saved repo/education and shows copied prompt text before generation
6. Wizard: build from repository → freewrite sources only → preview modal with JD sidebar highlight
7. Settings: tweak margins/font/spacing/weight/intensity → live mini preview updates; clearing/retyping numeric values does not snap mid-edit
8. Editor: select text → font/size dropdowns apply; bold/italic work
9. JD notes toggle → sidebar + hover/click highlight; hidden in PDF download
10. Page fit over by <=105% → **Fit small overflow** applies deterministic layout tweaks and re-measures
11. Send PDF / improvement in editor → step circles below panel → linked chat refinements work
12. Apply AI edits → version saved to `resume_versions`
13a. Wizard: **Cover letter from resume** → upload PDF + JD → Generate cover letter → editor opens on the letter with the extracted resume beside it; History session carries both
13. Edit anything in the editor → toolbar shows **Saving… / Saved HH:mm** → a **History** session titled `YYYY-MM-DD HH:mm` appears; further edits update it; opening it from History does not create a duplicate or bump its timestamp
14. Repository **Import** PDF → freewrite entries created/merged; ongoing entries (no end date) merge into the same repo item
15. Repository CRUD survives reload; ongoing = blank end date → "present" + badge
16. `npm run dev` — both servers start; `/api/repo` returns `[]` not HTML

---

## Reference

Original resume PDF: `<Your_Name>_Resume.pdf` (gitignored)
Extension-specific notes: `extension/README.md`
SQLite database: `~/.resume-builder/data.db`
