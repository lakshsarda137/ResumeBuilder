# LLM Council — Implemented

The original execution spec is done. Current behavior is documented in the README under **Resume builder wizard → LLM Council**. Quick recap:

- Wizard generate step has **Solitary LLM** (default) / **LLM Council** on both paths (repository + optimize).
- 2–3 **unique** candidate providers run in parallel (own background chat each); a single **judge** (defaults to **Claude**, changeable) runs after **≥2** succeed.
- Judge sees anonymized **A/B/C** drafts only (provider names revealed in the UI after); repository runs also pass the **candidate source material** so the judge can score evidence fidelity.
- **Scoring is a single ATS score out of 100 per candidate plus a 3–4 line plain-prose justification** (`{ atsScore, justification }`). The judge is told to keep scoring short because task 2 — writing the final resume — is what actually ships. This replaced a user-editable multi-dimension 1–10 rubric: at 7 dimensions × 3 candidates the judge wrote 21 scored rationales *before* reaching the resume, which ate its output budget. `RubricDimension` / `keyRubric` / `councilSettings.ts` and the rubric editors in Settings and the wizard were removed outright.
- The judge receives the **same writing contract as the candidates** (`resumeWritingRules.ts`) and is told its `final` must satisfy it even where no candidate did — otherwise the shipped resume silently regresses to whatever the candidates happened to do.
- Failures are tolerated (run continues; candidate-pick fallback when the judge can't run); Cancel aborts the whole run app-side.
- `CouncilProgress` is one cohesive branching tree: candidate step trackers on the spine, and the merge feeds into the judge as packets travelling down the spine itself (no separate diagram).
- Results extend `AiResultModal` (Final/Candidate switcher, the ATS score + justification, synthesis notes, per-candidate page-fit, failure badges). After apply, the editor's **Council build · view candidates** modal (`CouncilReviewModal`) shows each candidate's page-fit and can apply a different candidate to the editor. History persists a `CouncilSnapshot`.

- **Large-prompt delivery** (`utils/promptDelivery.ts`): every large send routes through `sendLargePromptAndWait`, which attaches the task as a `.txt` for providers that truncate (currently Gemini) and pastes for everyone else. Candidates, judge, solitary repository builds, and the editor's expand action all share it. On attach failure it still pastes, but now reports the extension's verbatim error through `onAttachFailed` — the wizard renders a **"Prompt was pasted, not attached"** banner plus the `gemini_attach_*` trace, so a silently truncated run can no longer look healthy.

Key files: `types/council.ts`, `utils/promptDelivery.ts`, `utils/resumeWritingRules.ts`, `CouncilProgress.tsx`, `aiPrompt.ts` (`buildCouncilJudgePrompt`), `parseResumeResponse.ts` (`parseCouncilJudgeResponse`), and the judge-wrapper capture gate in `content-llm.js` + `background.js`.
