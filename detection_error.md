# Detection Error Notes

## Current Status

Resume PDF import detection has been fixed for the observed Claude failure mode.

The confirmed working path now uses explicit `---JSON-START---` / `---JSON-END---` delimiters, provider-page extraction, background backup polling, and app-visible diagnostics. The key lesson from the failed attempts remains valid: prompt sending was not the bug; response completion/capture was.

Repository resume generation also now uses the stricter import-style JSON candidate detection so prompt/schema echoes cannot produce an empty resume preview.

## Important Constraint

Do not blame prompt sending.

The PDF prompt is sent. Claude generates the response. The issue is response completion/capture detection.

Do not replace PDF import with local markdown extraction unless the user explicitly asks for that architecture. Repository resume import is supposed to send the PDF attachment to the selected web LLM provider.

## Bad Fix Attempt

I made an unrelated and over-the-top architecture change: I switched repository resume PDF import from PDF attachment flow to local `/api/pdf/markdown` extraction and then sent the extracted markdown as a normal text prompt.

That was wrong.

Why it was wrong:
- The user explicitly said the problem is not prompt sending.
- The issue is response detection after Claude generates output.
- Replacing the PDF attachment flow with markdown changed product behavior instead of fixing detection.
- It risked breaking fidelity and user expectations for resume PDF imports.

This markdown/text-prompt change was reverted. Resume repository import should use `sendPdfAndWait` and attach the actual PDF.

## Changes Already Tried

Detection-related attempts included:
- Avoid treating prompt-contained sentinels like `---JSON-END---` as completion.
- Add fallback extraction from page text using JSON anchors such as `"entries"` and `"freewrite"`.
- Add a stable parseable-JSON fallback when Claude appears stuck in a streaming state.
- Move long-running capture away from a single long-lived Chrome `sendMessage` response and toward async capture/result relay.
- Lower the “real import payload” gate from `freewrite.length > 80` to `> 15`, because resume PDF entries may produce shorter freewrite chunks than LinkedIn.

These are now supplemented by backup polling in the background script and stricter candidate validation. The successful fix was not any single selector tweak; it was making the payload unambiguous and then accepting only candidate JSON that passes real-content checks.

## What Fixed It

- Prompts for repository imports require raw JSON between `---JSON-START---` and `---JSON-END---`.
- `content-llm.js` and `background.js` search multiple DOM/page-text sources instead of relying on one Claude selector.
- Candidate JSON is validated as a real import/resume payload before being accepted, so prompt schemas are rejected.
- Backup polling continues from the background script and relays a successful capture even if the content-script async response path fails.
- Diagnostics are copied programmatically from the app; the user should not need to paste console output.

## Later Fixes Built on This

- Repository resume generation now uses strict import-style JSON extraction instead of the generic resume parser.
- Contradiction handling now applies user choices before normal repository/education/profile merging.
- Import results are shown as a table with repository, ongoing, and education counts.
- Education "Skills & other notes" can be collapsed/expanded like education records.

## Do Not Repeat

Do not:
- claim the prompt was not sent,
- blame Claude for not generating,
- switch PDF import to markdown extraction,
- make broad architecture changes unrelated to detection,
- tell the user to reload as if that is the fix without evidence.

Do:
- keep the PDF attachment flow intact,
- focus on response completion/capture detection,
- add targeted instrumentation if needed,
- verify on the actual Claude PDF import path.
