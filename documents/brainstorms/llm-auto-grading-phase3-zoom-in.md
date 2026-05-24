# LLM Auto-Grading — Phase 3: Behavior Design (Shape B)

> Continues from [llm-auto-grading-phase2-zoom-out.md](./llm-auto-grading-phase2-zoom-out.md).
> Decisions taken: **Shape B** — AI suggestions live in a *separate* admin-only store, **per-student batched call**, **per-submission button** on the grading hub. This document specifies the **behavior** of the feature. Concrete data schemas, prompts, file layout, and code structure are intentionally out of scope here — they belong in the implementation plan.

---

## Where the Feature Lives

A new "Auto-grade with AI" surface appears on the grading hub, next to each student submission that is waiting for grading. Everything the feature does is **admin-side**. Nothing in the student experience changes until a teacher promotes an AI suggestion into a real grade.

---

## Behaviors

### 1. Triggering a grading run

- The button is **only visible** when the submission is in the "submitted, waiting for grading" state. Submissions that are still in progress, already fully graded, or soft-deleted (redo flow) don't show it.
- The first click on a submission runs an **initial generation**: the system sends every free-text question the student answered (and that hasn't been graded by a human) to the LLM in one batched call, and stores a suggestion per question.
- Subsequent clicks switch to **regenerate** mode, which requires the teacher to enter a short reason explaining what they want different (e.g. *"too lenient on partial credit"*).
- Multiple-choice questions are out of scope — they already auto-grade.

### 2. What the LLM sees

- One call per click, covering one student's free-text answers. This keeps the prompt context bounded and predictable.
- The LLM receives the question and the student's latest answer for each question in scope. No rubric, no model answer — the only schema change to the rest of the system is the new suggestion store.
- On a regenerate, the LLM also sees the **prior suggestion** for each question and the **teacher's reason**, so different reasons produce meaningfully different outputs.
- The LLM is asked to produce a score (0–100), short surgical feedback, and an optional self-reported confidence. Feedback is intentionally short because the grading UI is already side-by-side — the teacher reads it next to the student's answer.

### 3. History of suggestions

- Suggestions are **append-only** per `(test, question, student)`. Every regenerate adds a new row to the history; nothing is mutated.
- The teacher sees the latest suggestion by default, with a "view history" affordance that reveals prior suggestions newest-first along with each one's regeneration reason.
- The teacher can promote *any* historical suggestion — not just the latest — to the real grade.

### 4. Promoting a suggestion to a real grade

- The teacher promotes a suggestion via an "Apply" action on the chosen row. They can edit score/feedback inline before applying.
- Promotion creates (or overwrites) the real grade for that question, attributed to the teacher. Once a question has a teacher-authored grade, the AI pipeline treats it as off-limits.
- **Acceptance is exclusive**: at most one suggestion per `(test, question, student)` is the currently-applied one. Switching from suggestion v1 to v3 un-flags v1 and re-applies v3 — the real grade is overwritten.

### 5. Visibility

- AI suggestions are **never visible to the student**, regardless of any test-level "show grade after submit" flag. The student-facing visibility gate is untouched.
- The student only ever sees grades that a teacher has promoted, and only after the existing release gates fire (per-test flag, per-test release date, per-student release).

### 6. Skip / override rules

- The pipeline never overwrites a teacher-authored grade. If a teacher has already graded a question, the AI pipeline excludes that question from both initial generation and regenerate.
- The pipeline doesn't generate suggestions for questions the student didn't answer.

### 7. Staleness (redo flow)

- Students cannot resubmit by default. They only can when a teacher has opened an active redo request, which soft-deletes their prior submission.
- When that happens, any prior AI suggestions for the now-stale answers are kept in history but flagged as graded-against-an-older-answer. The teacher regenerates to get a fresh suggestion against the new answer.

### 8. Failure handling

- If the LLM call fails or its output is malformed, **no suggestions are written** for that click. The teacher sees an error and can retry.
- We never write partial results — either all suggestions in a batch land, or none do.
- Cost protection comes from the regenerate friction (required reason dialog) and the one-call-per-click batching, not from a hard limit. We don't introduce per-day or per-test cost ceilings in v1.

---

## What's Intentionally Out of Scope for v1

- **No per-question button.** The trigger is per-submission only. If the teacher wants to regenerate just one question, they regenerate the whole submission and ignore the suggestions they don't care about.
- **No prompt-version tracking** beyond "model name on the row". If we change the system prompt, we don't migrate or invalidate historical suggestions.
- **No rubric or model-answer field on the question.** Grading quality is whatever Gemini produces from the prompt alone.
- **No background / cron grading.** Teacher click is the only trigger.
- **No multimodal (image / math) grading.** Math questions stay on the existing image-annotation flow.
- **No per-test cost ceilings.** Friction is the only governor.

---

## Risks We're Accepting

- **AI quality without a rubric**: feedback may be uneven across question types. Mitigation: teacher is always in the loop — nothing reaches students without explicit promotion.
- **Cost on a power user**: a teacher could click regenerate many times. The required-reason dialog is the only governor. Acceptable for v1 since the audience is small.
- **Suggestion-history growth**: append-only means the collection grows with regenerates. Storage is cheap; we accept it. If a future analytic feature needs to roll up history, that's its own work.

---

## Open Questions Before the Implementation Plan

None — the behavior is fully specified. The remaining decisions (collection name, exact field set, model id, prompt wording, file layout, test breakdown) are implementation choices and belong in the next document.

---

## Hand-off

Say **"plan it"** and I will produce `IMPLEMENTATION_PLAN_ai-grading.md` following [.claude/rules/feature-development-guide.md](../../.claude/rules/feature-development-guide.md) Phase 1: numbered steps, acceptance criteria per step, test type per step, dependencies — and then stop and wait for **"implement it"** before any code is written.
