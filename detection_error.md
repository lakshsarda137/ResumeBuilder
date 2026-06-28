# Detection / Capture Notes

## Status
PDF import, optimize-PDF, repository generation, and LLM Council judge capture all work for the observed Claude/ChatGPT/Gemini failure modes.

## The one rule
**Prompt sending is not the bug — response completion/capture is.** The prompt is sent and the model generates; the work is detecting and extracting the finished output.

## How capture works
- Prompts emit raw JSON between `---JSON-START---` / `---JSON-END---`.
- `content-llm.js` + `background.js` scan multiple DOM/page-text sources (body text, assistant selectors, code blocks), extract delimited candidates first then balanced JSON objects.
- Captured JSON is validated as a real payload before being accepted, so prompt schemas/placeholders are rejected.
- Validation is **flow-aware** (`isCapturedPayload` + `expects*Wrapper`):
  - optimize → only `{ baseline, optimized }`;
  - LLM Council judge → only `{ scores, …, final }` (otherwise the inner `final` resume is relayed and scores are lost);
  - import/repository → real import/resume payloads.
- Background backup polling relays a capture even if the content-script async path fails. Diagnostics are copied from the app — no console pasting.

## Constraints
- Keep the real PDF attachment path for Claude/ChatGPT. **Gemini only** uses the `/api/pdf/markdown` text fallback (its hidden-tab upload won't open even with CDP focus emulation).
- Don't make broad architecture changes unrelated to detection. Add targeted instrumentation and verify on the real provider path.
- A new wrapper-shaped flow needs a matching `expects*Wrapper` gate in both files, and the user must reload the extension.
