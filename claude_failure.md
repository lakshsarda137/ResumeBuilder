# Response Detection: Post-Mortem of a Multi-Attempt Failure

## What Was Supposed to Happen
After Claude.ai finishes generating a JSON response, the extension should detect it, extract the JSON, and import it into the repository.

## What Actually Happened
Five separate fixes. None worked. Import never triggered.

---

## Attempt 1 — Remove streaming re-check
**Theory:** `isMessageStreaming()` was stuck `true` due to the "Fable 5 unavailable" banner, blocking the return gate.  
**Fix:** After finding valid JSON, skip the streaming check — wait 1.5s and return regardless.  
**Why it failed:** The JSON was never being *detected* in the first place. Fixing the return gate on a path that was never reached did nothing.

## Attempt 2 — Fix `looksLikeCaptureJson` for import payload shape
**Theory:** `looksLikeCaptureJson` only matched resume-shaped JSON (`sections`/`contact`). Import responses use `{ source_label, profile, entries }` which never matched, so `canParseResumeJson` always returned false.  
**Fix:** Added import payload key patterns to `looksLikeCaptureJson`.  
**Why it failed:** Correct diagnosis, but `"entries": [` was already matched by the existing check. The real blocker was elsewhere. Fix was partially redundant.

## Attempt 3 — Track text stability during streaming
**Theory:** The streaming guard (`if streaming && !detectedJson: continue`) skipped all content checks. Text tracking only happened in the block that was never reached.  
**Fix:** Move `lastText`/`lastChangeAt` tracking outside the streaming guard. Add a 3s stability window to override the guard even when streaming stays stuck.  
**Why it failed:** Still depended on `canParseResumeJson` eventually returning true. If extraction from the DOM was broken, no amount of stability tracking would help.

## Attempt 4 — Sentinel string `---END---`
**Theory:** All previous approaches were guessing at streaming state or DOM structure. Make the model explicitly signal completion with a known string. Poll `document.body.innerText` for `---END---` — no streaming state, no timers.  
**Fix:** Added `---END---` instruction to all prompt output rules. Rewrote `waitForAssistantResponse` to poll for the sentinel as primary exit condition.  
**Why it failed:** Unknown. The sentinel approach is architecturally sound and should have worked. Possible reasons not diagnosed:
- Claude may have ignored the `---END---` instruction (models sometimes drop trailing instructions)
- `document.body.innerText` may not include text inside certain shadow DOM components Claude.ai uses
- The extension may not have fully reloaded (Chrome caches service workers aggressively)
- `extractJsonCandidate` may have failed silently on the returned text
- The `content-llm.js` guard `if (!globalThis.__resumeBuilderLlmBridge)` may have prevented the updated code from running in already-open tabs

---

## Root Cause Never Confirmed
Every fix was based on a theory about where detection failed, but the actual failure point was never confirmed with logging. Without being able to inspect what `content-llm.js` was actually seeing in the DOM — what `getFullPageText()` returned, whether the sentinel appeared, what `extractJsonCandidate` produced — each fix was a blind guess.

## What Should Have Been Done First
Add `console.log` statements to `content-llm.js` and inspect them in the extension's background service worker DevTools (`chrome://extensions` → "Service worker" → Console) before writing any fix. One log line showing what text the script was seeing would have immediately revealed whether the problem was DOM extraction, JSON parsing, streaming detection, or something else entirely.

---

## Resolution Notes — 2026-06-26

The working fix was to stop relying on a generic sentinel or a single assistant DOM selector.

The current capture path uses:
- `---JSON-START---` / `---JSON-END---` delimiters for repository import payloads.
- Multiple text sources from the provider page (`body.innerText`, `body.textContent`, `documentElement` variants, assistant selectors, code blocks).
- Candidate extraction by delimiters first, then anchored balanced JSON objects.
- Real-payload validation so prompt schemas and placeholder JSON are rejected.
- Background backup polling that can still find and relay the result if the content-script async path fails.
- Programmatic diagnostics surfaced inside the app, with a single copy action.

Follow-up fix:
- Repository resume generation now reuses strict import-style JSON detection and rejects prompt/schema echoes before previewing a resume.

Regression rule:
Do not treat "valid JSON" as "usable provider output." It must be valid JSON *and* pass real-content validation for the specific flow.
