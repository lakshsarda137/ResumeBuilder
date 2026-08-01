# Next Steps

Open product/prompt work (current behavior lives in the README, not here).

## Resume generation quality
- ~~Action-verb variety~~ / ~~smarter bolding~~ **Done:** both now live in `utils/resumeWritingRules.ts`, the single writing contract shared by candidates, judge, solitary builds, optimize, expand, and the edit/refine loop.
- **Still open — validate the length rule against real renders.** Bullets are specified at 25–50 words *and* a hard two-rendered-line ceiling. `npm run estimate:line-budget` measures ~108 chars (~17–18 words) per bullet line at the default 10.5pt Times / 0.55in padding, so 50 words measures closer to three lines. The word range is the user's explicit call; the line ceiling is the backstop. If three-line bullets reappear, tighten the line ceiling rather than the word range.
- **Preserve source numbers:** keep credible metrics/counts/durations/percentages; compress wording before dropping a number. Show raw numbers from selected sources in the prompt preview so omissions are catchable.

## Prompt architecture *(reworked)*
- **One authority per instruction.** The assembled repository prompt had drifted into restating the same rule across four layers — bolding stated 12×, one-page 7×, bullet counts 6× — with real contradictions (templates asked for "editable placeholders" while the build rules banned placeholder text). Now: `buildSettingsInstructions` owns page limit / section order / entry density / bullet counts / renderer style; `resumeWritingRules.ts` owns bullet writing, length, verbs, and bold emphasis; the build prompt owns layout invariants, contact, and truthfulness; `resumeBuildStyle.ts` holds only genuinely template-specific bias. 79 → 65 directive lines, ~4.9k → ~4.2k tokens.
- **Keyword bolding is model-chosen.** The `keywordTerms` setting, the post-generation `emphasizeKeywords` regex, and all four UI inputs are gone. The model picks at most 3 words per bullet against a stated priority order. Classic renders the tags flat via `.resume-page--classic strong { font-weight: inherit }` rather than stripping them, so the choices survive in the JSON and resurface on template switch — stripping in JS would have destroyed them on the next inline edit, since `EditableText` writes `displayValue` back to state.
- **Settings migration.** `SETTINGS_VERSION` in `resumeSettings.ts` resets only `min/maxBulletsPerExperience` on load so shipped default changes actually reach existing `localStorage`. Bump it, and add to `MIGRATED_FIELDS`, when a default must propagate.

## Cover letter *(shipped — see README)*
- **Open: the letter goes stale when the resume is edited.** It is written from the resume as applied. Editing the resume afterwards does not update it; **Regenerate** re-runs against the current resume, but nothing prompts you to. A "resume changed since this letter was written" flag would close it.
- **Open: Regenerate does not survive a reload or a loaded history session.** The `CoverLetterRequest` (provider, sources, JD, settings) lives in a ref, so after a refresh the letter is still there and editable but cannot be re-run. Persist the request alongside the letter if this matters.
- **Open: the contact profile is a constant, not a setting.** `contactProfile.ts` holds the canonical name/email/phone/LinkedIn/GitHub. Editing it means editing that file. A small Settings section would make it user-editable; the resume/letter headers are also directly editable in the editor.
- **Existing resumes are not retrofitted.** `ensureContactProfile` runs on *generated* output only, so a resume already sitting in the editor (or restored from history) keeps whatever header it had. Deliberate: retroactively mutating a loaded historical document is worse than the missing link. Add GitHub by hand via **+ link**, or regenerate.
- Not wired: ChatGPT incognito (same gap as the resume path), and a cover-letter refine loop (the editor is inline-edit + Regenerate only).

## UI / design system *(pass done — conventions in the README)*
- **Behaviour change to confirm:** the editor's Style drawer is now per-resume and no longer writes the global default. If style tweaks made there should still stick for the next build, the drawer needs a "Save these as my defaults" action in its footer.
- **Two indicators for one number.** The vertical page-fit gauge in the rail and the new page-fit banner beside Download show the same value. Drop one, or keep the gauge only as the at-a-glance fill visual.
- Long slider labels ("Bottom margin (in)", "Before section gap (pt)") wrap to two lines because the value chip is pushed right by `margin-left: auto`, so paired grid rows sit at slightly different heights. Cosmetic; fix by shortening the labels or moving the chip to its own line.
- 18 pre-existing `react-hooks/set-state-in-effect` lint errors across 14 files remain — unrelated to this pass, but the repo does not lint clean.

## One-page fit
- Detect inefficient line usage (e.g. one-word last lines) from real DOM line boxes.
- **Done:** Download auto-compresses near-full/small-overflow resumes (spacing/margin/line-height tweaks, looped until usage is under the 98% `SAFE_FILL_RATIO`) so the exported PDF is always one page; a "Tight fit" badge flags the 98–100% zone. Still open: a **content-aware** auto-tighten pass for overflow above the small-formatting zone (>105%), compressing in order weak entries → weak bullets → wording → skills/coursework → low-value metrics, instead of just blocking.

## PDF typography
- Built-in PDF fonts ship only regular+bold, so intermediate CSS weights (e.g. body 500) collapse to the nearest face; the body-weight slider has no visible effect. To fix, embed/subset a variable font (or a print-PDF path that keeps selectable text + one-page checks).
- Always verify the downloaded PDF, not just the live preview, after typography/PDF-writer changes.

## LLM Council
- ~~The judge can't verify evidence fidelity without the raw sources~~ **Done:** repository runs now pass the candidate source material to `buildCouncilJudgePrompt` so the judge scores fidelity against the freewrite ground truth.
- ~~Multi-dimension rubric~~ **Done:** replaced by a single ATS score /100 + 3–4 line justification per candidate; see `llm_council.md`.
- True per-slot extension progress events (currently slot progress is app-driven heuristics).

## Gemini file attach — CDP file-chooser path *(LIVE; judge + candidate)*

**Status: confirmed working end-to-end for both the judge and repository candidates.** The `gemini-attach-test` CDP file-chooser attach is wired into the **real** extension + app:
- **Backend** `POST /api/tmpfile` (`base64`|`text` + `filename` → writes a temp file, returns its absolute path; 10-min TTL cleanup; unique subdir per call for bulk concurrency).
- **Frontend** `useAiBridge.sendPromptAsFileAndWait`: for Gemini, writes the judge `.txt` via `/api/tmpfile` and sends `SEND_PDF { geminiFilePath }` (no base64). Claude/ChatGPT keep the base64 content-script attach.
- **Extension** `background.js`: ported `runCdpFileChooser`/`findUploadButtonCoords`/`collectMenuCandidates`/`pickUploadItem`/`cdpTrustedClick`/`waitForGeminiFileChip` + a `foregroundTab` restore helper + `attachGeminiFileViaCdp`. In `startSendPdf`, `gemini + geminiFilePath` → foreground the tab → attach debugger → intercept-attach the file → detach → restore focus → `startLlmCapture(skipAttach:true)` to paste the cover prompt + submit + capture. On any attach failure it closes the tab and throws, so the app **falls back to the paste path** (no regression). Build/typecheck/`node --check` all pass; the `/api/tmpfile` I/O is unit-verified.
- **Scope / constraint:** the CDP attach briefly **foregrounds** the Gemini tab (the chooser only opens for the active tab). Originally judge-only; the user has since OK'd extending it to **repository candidates**, which now go through `sendLargePromptAndWait` too. Gemini **candidate PDFs** (`sendPdfAndWait`, the optimize path) remain on the no-foreground local-markdown path — that one still carries a PDF the bridge can only attach one file for.
- **Do not "simplify" Gemini onto the content-script attach.** It was tested and *fails*, background and foreground alike (see Investigation below). A later change routed Gemini through it as a "fix" and broke the working path; the only correct mechanism is CDP interception. `useAiBridge.sendPromptAsFileAndWait` carries a comment saying so.
- **Attach failures are now visible.** `sendLargePromptAndWait` no longer swallows the error: it logs and calls `onAttachFailed`, and the wizard shows a **"Prompt was pasted, not attached"** banner with the extension's verbatim message plus an expandable `gemini_attach_*` trace (`debugEvents` is threaded into the wizard). Previously an attach failure silently degraded to a truncated paste and the run looked healthy.
- **When debugging it:** restart the backend first (`node` server doesn't hot-reload; `/api/tmpfile` is what writes the `.txt`). Watch `gemini_attach_plus` / `gemini_attach_item` / `gemini_attach_chip` — now surfaced in the wizard banner, not just `AiPanel`. `gemini_attach_menu_miss` dumps the live menu if a label changed. `no fileChooserOpened` means the clicks landed but no chooser opened: check the tab was actually foregrounded and that DevTools isn't attached to it (Chrome allows one debugger client per target).
- **Ordering hazard:** the file is attached in `background.js` *before* `content-llm.js` runs its incognito toggle, and toggling Temporary chat re-renders the composer and clears attachments. Not yet observed in practice; suspect it first if an attach succeeds and the file then disappears.

**Problem (why this exists).** The Council **judge** prompt is the app's largest (JD + rubric + full source material + 2–3 complete resume JSONs + schema + rules). Pasted into Gemini's composer it **silently truncates** — the tail carries the output-format contract, so a cut prompt makes Gemini reply with freeform prose instead of the `---JSON-START--- … ---JSON-END---` JSON. Before this integration the content-script attach **failed on Gemini**, so it fell back to the truncating paste (judge effectively broken on Gemini).

**Investigation** (standalone `gemini-attach-test/` extension — verbatim copy of `content-llm.js` + the CDP wake, popup with 4 variants):
- Content-script / synthetic-event attach **fails**, background *and* foreground — so it is **not** a focus problem. Gemini's "+" menu opens but exposes no reachable `<input type=file>`; "Upload files" opens the **native macOS file picker**, which synthetic clicks and drag/drop cannot feed.
- **CDP file-chooser interception works** (confirmed end-to-end): `Page.setInterceptFileChooserDialog({enabled:true})` → trusted `Input.dispatchMouseEvent` clicks on "+" then "Upload files" → `Page.fileChooserOpened` returns the input's `backendNodeId` (Gemini **does** use a real hidden `<input type=file>`, `mode: selectMultiple`) → `DOM.setFileInputFiles({backendNodeId, files:[absPath]})` attaches the file. This is the Puppeteer/Playwright mechanism — focus-agnostic, works in a background tab. The extension already attaches `chrome.debugger` during sends (the CDP wake), so the CDP domains are already available.

**Next steps — testing is NOT yet done:**
1. **Confirm the file is sent *with* the message.** The first experiment run submitted before the upload finished, leaving the file chip stranded in the composer (a race). A "wait for the file chip / upload to finish before submit" step was added; re-run `gemini-attach-test/` variant 4 to confirm — its prompt now asks Gemini to quote a specific line of the file, so a correct answer proves receipt (and the composer should clear).
2. **Integrate into the real judge flow (Gemini-only).** `DOM.setFileInputFiles` reads from **disk by absolute path**, so the judge `.txt` must be a real file: have the local Express backend write a temp `.txt` of the judge prompt (it already writes temp files for PDF rendering) and return its absolute path → the bridge passes the path to the extension → `extension/background.js` runs the intercept-attach (it already holds the debugger via the CDP wake) → hand off to `content-llm.js` to paste the cover prompt + submit (`skipAttach:true`). Keep Claude/ChatGPT on their working content-script attach.
3. Then **retire / demote the Gemini paste fallback**, and consider the same path for other large Gemini prompts (e.g. Gemini as a candidate with a big repository prompt).

**Regardless of the above:** harden the paste path so a truncated paste fails loudly — today the composer readback (`elementContainsPromptProbe`) only verifies the first ~160 chars, so tail-truncation is silent. And/or default the judge to **Claude/ChatGPT**, whose composers accept the full prompt.

## Incognito / temporary chat generation *(DONE)*

Pre-generation **Incognito mode** checkbox (both Solitary + Council, both paths) that builds the resume in a private/temporary chat the provider does not save.
- **Frontend** `ResumeBuilderWizard.tsx`: `incognito` state (persisted `resume-builder-ai-incognito` via `getSavedIncognito`/`saveIncognito`), checkbox at the top of the actions section, threaded through `useAiBridge` `sendPdfAndWait`/`sendPromptAndWait`/`sendPromptAsFileAndWait` (not the refine loop — it reuses the already-incognito chat).
- **Extension** `background.js`: `incognito` added to the new-chat entry points (`startSendPrompt`/`handleSendPrompt`/`startSendPdf`/`handleSendPdf`) → `INJECT_PDF`. `content-llm.js` `enableIncognitoChat(provider)` clicks the toggle before attach/type/submit, then re-waits the composer; **throws/aborts** if it can't confirm the toggle activated (never falls back to a saved chat).
- **Confirmed markers:** Claude click `button[aria-label="Use incognito"]` (exit control appears / URL changes); **Gemini** click `button[aria-label="Temporary chat"]`, confirmed by the `<gem-icon-button>` wrapper gaining a **`temp-chat-on`** class (its own aria-label/aria-pressed don't change). Both **verified working live**. Watch the `AI_DEBUG` `content_incognito_toggle` event.
- **Not done / future:** ChatGPT is unwired (out of scope); markers are provider UI and will drift — re-diff a real toggle click to re-anchor if it starts false-aborting.

## Diff / review UX
- Filters for changed/added/removed cards; optionally collapse AI-note-only changes.

## Repository ↔ Ongoing
- ~~Explicit link field between repo and ongoing records instead of identity-heuristic matching; let the user choose inherit/append/separate.~~ **Done (unified):** Ongoing was merged into Repository — an ongoing item is just a repo entry with **no end date** (renders as "present" + an *ongoing* badge). The separate Ongoing page, its `/api/ongoing*` routes, the `ongoing_items`/`reflections` tables, the wizard's ongoing sources/filters, and the import cross-linking were all removed. Reflections/compile-to-freewrite are gone; if per-item progress notes are ever wanted again, add them as an optional field on repo items.
