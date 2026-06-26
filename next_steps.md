# Next Steps

This file tracks product and prompt improvements that are not finished yet. It is intentionally separate from the README so the README can describe current behavior while this file captures what to build next.

## Resume Generation Quality

### Action verb variety

The LLM should not start multiple bullets with the same action verb.

Planned prompt rule:

```text
Do not start two bullets with the same action verb. Track bullet-opening verbs across the whole resume and vary them naturally. Prefer precise verbs over generic repeats such as Built, Developed, Implemented, or Led.

Before final output, audit all bullet-opening verbs. If any opening verb repeats, rewrite the weaker bullet with a different accurate verb.
```

Acceptance check:
- No duplicate first verb across bullet text after stripping inline HTML.
- Rewrites must stay truthful to the selected source material.

### Better bolding

Current automatic bolding can be noisy. The LLM should not rely on the user's preferred keyword terms as a bolding checklist.

Planned prompt rule:

```text
Do not bold text merely because it appears in the preferred keyword list. Use <strong> only when it improves scanability: a core metric, named technical system/tool, or role-defining outcome. Never bold filler words, generic verbs, entire bullets, or every occurrence of a technology. Use at most one bold span per bullet, and leave many bullets unbolded. If unsure, do not bold.
```

Acceptance check:
- No colored highlighting.
- No whole-bullet bolding.
- No repeated bolding of the same generic keyword across many bullets.
- Bold spans should point to evidence, not buzzwords.

### Preserve source-supported numbers

The generated resume dropped too many useful source numbers. Metrics should be treated as high-value evidence.

Planned prompt rule:

```text
Preserve all credible source-supported numbers, metrics, counts, durations, percentages, scale indicators, rankings, GPA/honors, dataset sizes, latency/cost/user counts, and adoption figures when relevant. Do not drop numbers merely to polish prose. If a number is useful but the bullet is too long, compress surrounding wording before removing the number.

Before final output, audit each selected source entry for numbers/metrics. If a relevant number from the source was omitted, either include it in a bullet or omit that source entry entirely if the number cannot be used truthfully.
```

Acceptance check:
- Preview prompt should include the raw numbers from selected repository/ongoing/education sources.
- Generated bullets should preserve relevant numbers unless there is a clear fit or relevance reason to omit them.

## One-Page Fit Strategy

The app can measure rendered page fit, but the LLM cannot see the renderer. The current strategy is to give the first LLM call concrete density quotas, then let the renderer enforce the actual page boundary.

Implemented now:
- Repository generation targets 4-5 substantial experience/project entries when source quality supports it.
- Repository generation targets 11-13 total experience/project bullets, mostly 1-2 bullets per entry, with 3 bullets reserved for the strongest entry.
- Settings expose page margins, font sizes, line height, and section/title-to-content/entry spacing with units.
- Settings has a scaled live preview rendered by the same `ResumeDocument` component used for PDF export.
- Settings number inputs use typed drafts so clearing/replacing values does not snap to clamped minimums mid-edit.
- The editor measures rendered fit and blocks export when content remains over one page.
- For small overflow up to 105%, the editor can apply deterministic layout-only fit tweaks before content is removed.

Remaining possible work:
- Detect inefficient rendered line usage, such as one-word final lines, using actual DOM line boxes.
- Add a user-approved Auto-tighten content pass for overflows above the small-formatting zone.
- Compress in this order when content edits are needed: remove weak entries, remove weak bullets, shorten wording, reduce skills/coursework, then remove only low-value metrics.
- If measured fit is well over 100%, run an optional compression prompt with the actual overflow percentage, e.g. "Current render is 115%; reduce content by about 18-22% while preserving source-supported metrics."

## Prompt Preview Follow-Ups

Implemented now:
- The wizard has a Preview prompt button before generation.
- Repository prompt preview refetches repo, ongoing, and education before showing text, using the same prompt construction path as Generate.
- The prompt modal can copy the exact prompt text.

Potential improvements:
- Show selected source labels and token estimates inside the prompt preview modal header.
- Highlight the source JSON block inside the prompt preview for faster inspection.
- Add a small "numbers found" summary for selected sources so omitted metrics are easier to catch before sending.

## Repository And Ongoing Source Semantics

Current behavior after the latest fix:
- Repository and Ongoing remain separate user-editable pages.
- Matching repo and ongoing records are no longer deduped across pages during resume generation, so an ongoing reflection bundle cannot silently mask an edited repository freewrite source.

Possible future work:
- Add an explicit link field between repo and ongoing records instead of matching by identity heuristics.
- In Ongoing, show a linked repository freewrite preview when one exists.
- Let the user choose whether a linked ongoing item should inherit the repo freewrite, append reflections, or stay separate.

## Verification Checklist For These Next Steps

- Preview prompt after editing a repository entry; confirm the edited freewrite appears.
- Preview prompt when a matching ongoing item exists; confirm both selected sources are visible when checked.
- Generate from repository and inspect first verbs; no repeated bullet-opening verb.
- Inspect bold spans in preview/PDF; bolding should be sparse and evidence-driven.
- Compare source numbers with generated bullets; important metrics should survive.
- If generated preview is over one page, use measured overflow to drive compression rather than exporting a truncated PDF.
