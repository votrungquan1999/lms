# LLM Auto-Grading — Phase 2: Zoom-Out Alternatives

> Continues from [llm-auto-grading.md](./llm-auto-grading.md). Constraints locked in from the clarifying-questions answers are summarized at the top, then we zoom out from the widest view and progressively narrow.

---

## Locked Constraints (from Phase 1 answers)

| # | Decision | Implication |
|---|---|---|
| Trigger | **Admin button on grading hub** | New `aiAutoGradeAction` server action, no cron, no queue. Mirrors existing `gradeQuestionAction` pattern. |
| Release | **Draft → human review → release** | AI grades must be **distinguishable** from human grades AND **invisible to students** until a teacher releases. |
| Schema | **Minimal change** — grade against question + student answer only | No new fields on `QuestionDocument`. LLM context = `question.content` + `latestAnswer.text`. Side-by-side UI surfaces context for the teacher. Prompt should produce **surgical**, change-pointing feedback (don't rewrite the answer). |
| Override | **Skip human-graded** | Pipeline checks `grade.gradedBy` and skips when it doesn't start with `"ai:"`. |
| Question types in scope | Free-text only (Phase 1, H1 explicitly). MC already auto-grades. Math images out of scope for v1. |

These constraints **eliminate** the queue/job-worker family, the rubric-schema-migration family, and the inline-in-`submitTest` family. We are now zooming into a much narrower design space: **a teacher-triggered server action that calls Gemini and writes draft AI grades.**

---

## Zoom Level 1 — Three Big-Picture Shapes

These are the architecturally distinct shapes the feature could take, given the locked constraints. Each affects the data model, the UI, and the trust story differently.

### Shape A — "AI Grade as Real Grade, Marked by `gradedBy`"

The LLM writes a normal `GradeDocument` via `gradeService.gradeQuestion(...)` with `gradedBy = "ai:gemini-2.5-flash"`. The teacher then opens the grading hub, sees the score & feedback pre-filled, and either:
- accepts it (no change — re-runs through `releaseGradesAction`), OR
- overrides via the existing `gradeQuestionAction` (which sets `gradedBy = teacherId`, making the override sticky to the [skip rule](#locked-constraints-from-phase-1-answers)).

How the "draft" property is achieved: by **withholding release**. We never call `releaseGradesAction`/`releaseGradeForStudentAction` until the teacher clicks release. The student-side `GradeVisibilityService` already gates on these flags, so AI grades stay hidden until release.

**Pros**
- Zero schema change. Reuses existing `GradeDocument`, `gradeQuestion()`, `gradedBy` audit, release flow, and visibility gate.
- The `getAverageScore` "ungraded free-text → null" path automatically unblocks once AI writes the grade. Good for teachers seeing a real average even before release.
- Override path is identical to today's manual grading — teacher edits one field, audit captures human-replaced-ai via `updatedBy`.

**Cons**
- The grade collection now mixes human and AI grades with no structural separation. If trust in AI is low early on, a teacher might forget some grades are AI-authored when scrolling lists.
- "Has this been reviewed by a human yet?" is not directly representable — only "released to student yet" is. If a test has `showGradeAfterSubmit = true`, AI grades would auto-reveal to students. That's a footgun (see [risk R1](#risks)).
- Re-running the pipeline must check both *grade exists* and *gradedBy starts with `"ai:"`* to be safe — a single rule covers idempotency + skip-human-graded, but it's spread across two fields.

**Principle**: trust the existing release gate to *be* the draft mechanism. Minimal code, but conflates "is AI work" with "is unreleased".

---

### Shape B — "AI Suggestion in a Separate Collection, Promoted on Review"

The LLM writes to a new collection `grade_suggestion` (or `ai_grade_draft`) — a sibling of `grade` with the same `(testId, questionId, studentId)` key. The grading hub UI shows the suggestion next to the empty grade slot. The teacher hits **Accept** (copies suggestion → real grade via `gradeQuestion`) or **Edit & Accept** (opens the suggestion pre-filled in the existing input).

**Pros**
- Cleanest separation. Human grades and AI suggestions never collide. "Has human reviewed this?" = "does a row exist in `grade`?"
- The `showGradeAfterSubmit = true` footgun disappears — students never see suggestions because suggestions aren't in the `grade` collection.
- Easy to delete/regenerate without touching the audit history of human grades.
- `getAverageScore` keeps its current semantics — null until a *human* approves. Predictable for students.

**Cons**
- Introduces a new collection, new service, new service-singleton entry, new server action for "accept suggestion". More files, more tests. Possibly conflicts with the "minimal changes" constraint.
- The teacher still has to click accept for every question. Worse productivity gain than Shape A if the AI is consistently good.
- Suggestions are stale-prone: if the student resubmits an answer (append-only model allows it), suggestions must be invalidated. Adds invalidation logic.

**Principle**: explicit separation between "AI proposal" and "graded record". More plumbing, but a stronger invariant.

---

### Shape C — "AI Grade as Real Grade with an Explicit `isDraft` flag on the Grade Document"

Add one field to `GradeDocument`: `reviewedByHuman: boolean` (or `aiDraft: boolean`). The LLM writes via `gradeQuestion` with `gradedBy = "ai:..."` and `reviewedByHuman = false`. Teacher acceptance flips the flag. `GradeVisibilityService` is extended with **one extra clause**: never reveal to student when `reviewedByHuman === false`, *regardless* of other gates.

**Pros**
- Solves Shape A's footgun (auto-reveal-via-`showGradeAfterSubmit`) with one line in the visibility gate.
- Keeps a single grade collection — no new collection, no parallel pipeline.
- "Needs human review" is a queryable property: `grade.find({ reviewedByHuman: false })`.
- Override path: teacher's manual grade flips `reviewedByHuman = true` automatically (since `gradeQuestion` is the entry point).

**Cons**
- Schema change. Touches `GradeDocument`, the conversion functions, all `gradeQuestion` call sites, and `GradeVisibilityService`. Backfill needed for existing rows (default `true`).
- The locked constraint says "minimal change"; one extra field is small but non-zero.
- Two semantic axes now exist (released-yet + reviewed-yet) that interact. Need a clear matrix.

**Principle**: explicit state model for human-review status, decoupled from release. Slightly more schema, much clearer mental model.

---

## Comparison Table

| Aspect | Shape A (release gate = draft) | Shape B (separate `grade_suggestion`) | Shape C (`reviewedByHuman` flag) |
|---|---|---|---|
| Schema change | None | New collection | One field on `GradeDocument` |
| New files | Action + AI service | Action + AI service + new service + new collection types | Action + AI service + field on doc |
| Risk of leaking AI grades to students | **High** (if `showGradeAfterSubmit=true`) | None | None |
| Re-runnable / idempotent | Check `gradedBy` prefix | Upsert into suggestions | Check `gradedBy` prefix OR `reviewedByHuman` |
| Teacher UX | Score auto-fills, teacher edits if needed | Side-by-side "AI suggests X" with explicit Accept | Score auto-fills, but flagged "Needs review" |
| Effect on `getAverageScore` semantics | Average becomes computable immediately on AI write (could mislead) | Average stays null until human reviews (matches today) | Average computable on AI write, but we can change `getAverageScore` to only count `reviewedByHuman` rows |
| Resubmission/stale handling | Re-run pipeline overwrites old AI grade only (skips human) | Need explicit invalidation when answer changes | Re-run overwrites old AI grade only (skips human-reviewed) |
| Aligns with "minimal change" constraint | Strongest | Weakest | Middle |

---

## Recommendation (to validate, not commit)

**Shape C is the best fit for the locked constraints**, with Shape A as a viable "ship faster" fallback. Reasoning:

- Shape A's auto-reveal footgun is real: today's [grade-visibility-service.ts](../../src/lib/grade-visibility-service.ts) opens reveal when `Test.showGradeAfterSubmit === true` — that flag is per-test admin-set and quite likely to be `true` on practice tests. An AI grade written during a teacher's "preview" click would instantly become visible to the student. That violates the draft-until-reviewed requirement.
- Shape B is the cleanest but the most code. Given the explicit "minimal change" steer, it's likely overkill for v1.
- Shape C adds one boolean field, one clause in the visibility gate, and one new server action. It honors both the "minimal change" steer and the "draft until reviewed" rule, and it lets `gradedBy = "ai:..."` carry the audit story orthogonally.

If you disagree (e.g. you'd prefer no schema change at all and would accept the footgun risk by promising never to enable `showGradeAfterSubmit` on tests that get AI grading), say so and we'll re-pick Shape A.

---

## Risks (cross-cutting, apply to all shapes)

<a id="risks"></a>

- **R1 — Leakage**: AI grade visible to student before review (only Shape A is exposed).
- **R2 — Hallucinated scores**: LLM outputs a number that doesn't reflect the answer. Mitigation: ask Gemini for `score + feedback + criteria` and require the score to be inside `[0, 100]` via Zod. Add a `confidence` field the teacher sees but isn't load-bearing.
- **R3 — Idempotency on re-run**: a second "Auto-grade with AI" click should not duplicate work, not overwrite human grades, and not silently re-prompt for grades that are already AI-written with the same model. Mitigation: pre-filter the question set by querying existing grades, skipping where `gradedBy` is human OR (`gradedBy` is AI AND we don't want a refresh).
- **R4 — Cost surprise**: an admin clicking the button on a 50-student × 10-free-text-question test = 500 LLM calls. Mitigation: show a confirmation modal with "this will grade N questions" before invoking; consider batching multiple students of *the same question* in one prompt to reduce calls (the question content is identical).
- **R5 — Append-only answer resubmission**: a student can resubmit after AI grading. The AI grade becomes stale but the system has no signal. Mitigation: store `gradedAgainstAnswerId` (the `Answer.id` we graded) on the grade doc OR re-run the pipeline before release.

---

## Open Questions Surfaced by Phase 2

Before zooming into Zoom Level 2 (concrete code/files/prompts for the chosen shape), I'd like one more decision and one clarification:

- **Q11 (decision)**: Shape A, B, or C? Default recommendation is **C**. See [Recommendation](#recommendation-to-validate-not-commit).
- **Q12 (cost shape)**: Are you OK with **one Gemini call per (student, question)** for v1 (simpler, slightly more expensive), or do you want me to design **one call per question covering all students** (batched, cheaper, but the prompt has to keep students separate cleanly)? My instinct: per-(student, question) for v1, parallelize with `Promise.all` capped at e.g. 5.
- **Q13 (granularity)**: Should the admin button live on the grading hub at (a) per-test level ("Auto-grade all pending in this test"), (b) per-student level ("Auto-grade this student's free-text"), or (c) per-question level ("Auto-grade just this answer")? Or all three? Per-test is cheapest to ship.

---

## Next Step

Answer Q11–Q13 (or push back on the recommendation), and I'll zoom into **Level 2** in a new file: concrete file layout (`src/lib/ai/grading-service.ts`, prompt template, Zod output schema, server action wiring, exact test scenarios per `.claude/rules/tdd-guidelines.md`, file-by-file diff summary). That document will be the bridge into the `feature-development-workflow` Phase 1 plan.
