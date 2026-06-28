# LLM Council — Implemented

The original execution spec is done. Current behavior is documented in the README under **Resume builder wizard → LLM Council**. Quick recap:

- Wizard generate step has **Solitary LLM** (default) / **LLM Council** on both paths (repository + optimize).
- 2–3 **unique** candidate providers run in parallel (own background chat each); a single **judge** runs after **≥2** succeed.
- Judge sees anonymized **A/B/C** drafts only (provider names revealed in the UI after). Rubric is multi-dimension, 1–10, equal weight — defaults in Settings, per-run override in the wizard.
- Failures are tolerated (run continues; candidate-pick fallback when the judge can't run); Cancel aborts the whole run app-side.
- Results extend `AiResultModal` (Final/Candidate switcher, scores + rationales, synthesis notes, per-candidate page-fit, failure badges). History persists a `CouncilSnapshot`.

Key files: `types/council.ts`, `utils/councilSettings.ts`, `CouncilProgress.tsx`, `aiPrompt.ts` (`buildCouncilJudgePrompt`), `parseResumeResponse.ts` (`parseCouncilJudgeResponse`), and the judge-wrapper capture gate in `content-llm.js` + `background.js`.
