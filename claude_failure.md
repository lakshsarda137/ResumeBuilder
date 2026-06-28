# Post-Mortem: Multi-Attempt Detection Failure (2026-06-26)

Five fixes shipped for "Claude response not detected"; none worked, because each was a theory about *where* detection failed, never confirmed with logging. The actual failure point (DOM extraction vs JSON parse vs streaming guard) was never inspected first.

**Lesson:** add a log line showing what `content-llm.js` actually sees in the DOM (via the extension service-worker console) *before* writing any fix. One log would have revealed the real branch immediately.

**Resolution:** stop relying on a generic sentinel or a single assistant selector. The working path uses `---JSON-START---`/`---JSON-END---` delimiters, multi-source page-text scanning, delimited-then-balanced candidate extraction, real-payload validation per flow, and background backup polling that relays the result if the content-script path fails.

**Regression rule:** "valid JSON" ≠ "usable provider output." It must be valid JSON *and* pass real-content validation for the specific flow.
