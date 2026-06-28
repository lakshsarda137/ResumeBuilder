# Next Steps

Open product/prompt work (current behavior lives in the README, not here).

## Resume generation quality
- **Action-verb variety:** don't start two bullets with the same verb; audit and rewrite the weaker one before output.
- **Smarter bolding:** `<strong>` only for a core metric, named system/tool, or role-defining outcome — not because a term is in the keyword list. At most one bold span per bullet; many bullets unbolded; never colored.
- **Preserve source numbers:** keep credible metrics/counts/durations/percentages; compress wording before dropping a number. Show raw numbers from selected sources in the prompt preview so omissions are catchable.

## One-page fit
- Detect inefficient line usage (e.g. one-word last lines) from real DOM line boxes.
- Optional user-approved auto-tighten pass for overflow above the small-formatting zone, driven by measured overflow %, compressing in order: weak entries → weak bullets → wording → skills/coursework → low-value metrics.

## PDF typography
- Built-in PDF fonts ship only regular+bold, so intermediate CSS weights (e.g. body 500) collapse to the nearest face; the body-weight slider has no visible effect. To fix, embed/subset a variable font (or a print-PDF path that keeps selectable text + one-page checks).
- Always verify the downloaded PDF, not just the live preview, after typography/PDF-writer changes.

## LLM Council
- The judge sees only candidate resumes + JD + render settings, **not** the raw repository sources, so it can't fully verify evidence fidelity. Consider passing a compact source digest to the judge for repository runs.
- True per-slot extension progress events (currently slot progress is app-driven heuristics).

## Diff / review UX
- Filters for changed/added/removed cards; optionally collapse AI-note-only changes.

## Repository ↔ Ongoing
- Explicit link field between repo and ongoing records instead of identity-heuristic matching; let the user choose inherit/append/separate.
