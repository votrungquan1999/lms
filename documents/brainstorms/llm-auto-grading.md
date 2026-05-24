# Brainstorm: Programmatic LLM Auto-Grading of Free-Text Answers

> Phase 1 of the structured-brainstorming workflow: **problem definition + clarifying questions**.
> No solutions are committed yet — Phase 2 (zoom-out alternatives) will only start after the user answers the clarifying questions.

---

## Problem Statement

We want a programmatic pipeline that:

1. Finds student test submissions that are **submitted but waiting for grading** (specifically the **free-text** questions that auto-grading currently skips).
2. For each ungraded free-text question, loads the **question content** and the **student's latest answer**.
3. Calls an **LLM (Gemini, via the already-installed `@ai-sdk/google` + `ai` SDK)** to produce a `score (0-100)` and `feedback` string.
4. Writes the result back via the existing `GradeService.gradeQuestion(...)` upsert path, with `gradedBy = "ai"` (or similar).

The goal of *this* document is **not** to ship the feature, but to map the solution space and surface decisions the user needs to make.

---

## Context (from code survey)

I read ~10 files in `src/lib/` and surveyed the broader repo. Key facts grounding the brainstorm:

- **Question types** ([src/lib/question-service.ts](../../src/lib/question-service.ts)): `single_select`, `multi_select`, `free_text`. Only free-text needs the LLM — MC is already auto-graded by [GradeService.autoGradeTest](../../src/lib/grade-service.ts#L77).
- **Submission lifecycle** ([src/lib/test-submission-service.ts](../../src/lib/test-submission-service.ts)): a `test_submission` row with `submittedAt` and soft-delete `deletedAt` marks a test as "submitted". `submitTest()` already triggers MC auto-grading at line 78.
- **Status derivation** ([src/lib/test-status-service.ts](../../src/lib/test-status-service.ts)): `submitted` vs `graded` is computed from presence/absence of grades on all questions.
- **Grade model** ([src/lib/grade-service.ts](../../src/lib/grade-service.ts#L15)): one grade per `(testId, questionId, studentId)`; `gradedBy` is an audit string already used (`"system"` for MC). Free-text grade requires manual entry today.
- **Answers** ([src/lib/answer-service.ts](../../src/lib/answer-service.ts#L128)): append-only; `getLatestAnswers(testId, studentId)` returns the most recent answer per question.
- **AI surface area**: [src/lib/ai/](../../src/lib/ai/) exists but is empty. `@ai-sdk/google` + `ai` are in [package.json](../../package.json). No prompts, no model wrappers yet.
- **Server actions pattern**: [src/app/admin/.../grading/actions.ts](../../src/app/admin) — Zod-validated `"use server"` functions, auth via `requireAdminSession()`, services via `services-singleton.ts`, `revalidatePath()` on mutation.
- **Scripts pattern**: [scripts/backfill-soft-delete-and-release.ts](../../scripts/backfill-soft-delete-and-release.ts) — idempotent Mongo backfill template with direct client, `process.exit(1)` on error.
- **Math questions** ([documents/features/math_questions.md](../features/math_questions.md)): currently image-based — students upload handwritten work, teachers annotate images. Out of scope for v1 unless we go multimodal.
- **Special constraint**: `getAverageScore` ([grade-service.ts:247](../../src/lib/grade-service.ts#L247)) returns `null` whenever **any** free-text question is ungraded. So LLM grading directly unblocks the student-visible average score.

---

## Initial Hypotheses

These are **starting points to challenge**, not commitments:

- **H1**: A standalone async job (cron + script, or admin-triggered server action) is a better fit than inlining the LLM call into `submitTest()`, because LLM calls are slow/expensive/flaky and should not block the student's submit-button request.
- **H2**: The LLM should produce a **structured JSON** response (`{ score, feedback, rubricBreakdown? }`) using the AI SDK's `generateObject` with a Zod schema, so the output drops straight into `GradeService.gradeQuestion()` without freeform parsing.
- **H3**: Free-text questions need **per-question grading guidance** that doesn't exist today (no rubric field, no model answer). The minimum viable version may need a schema change OR a heuristic ("grade against the question prompt alone"), and that choice changes everything downstream.
- **H4**: AI-generated grades should be **distinguishable from human grades** (e.g. `gradedBy = "ai:gemini-2.5-flash"`) so teachers can review/override them, and per-student release gates can optionally require human confirmation.
- **H5**: The pipeline must be **idempotent + safe** — re-running it should not overwrite a teacher's manual grade (the `gradeQuestion` upsert today *does* overwrite; we may need a guard).

---

## Stakeholders & Impact

- **Students** — get faster feedback; risk of unfair/hallucinated grades if quality is bad.
- **Teachers/admins** — saved manual grading time; need a review/override surface.
- **System** — adds Gemini cost, latency, and a new failure mode (network, rate limits, malformed output).
- **The grade-visibility flow** ([src/lib/grade-visibility-service.ts](../../src/lib/grade-visibility-service.ts)) — already gates reveal; AI grades flow through the same gates so this is mostly orthogonal.

---

## Constraints

- **Tech stack already set**: Next.js (App Router), MongoDB, server actions, Vercel AI SDK + Gemini.
- **Repo rules** (see [.claude/rules/](../../.claude/rules/)): files ≤300 lines, no defensive try/catch, services via singleton, typed `*Document` collections, JSDoc on every function, individual exports, follow TDD + 4-Pillars for tests.
- **Don't run dev/build**: validation via tests + types only (`meta-rules.md`).
- **Out-of-the-box**: there is no rubric field, no model-answer field, no question-level "max points" beyond a `weight`. The data we can feed the LLM today is just **question prompt + student text + (optional) the existing `grade.solution` field**.

---

## Clarifying Questions (please answer before Phase 2)

The answers materially change the architecture, so I want them up front instead of guessing. Grouped by impact:

### Group A — Trigger & timing (biggest architectural fork)
1. **When should LLM grading run?**
   - (a) Immediately inline during `submitTest()` — student waits a few seconds.
   - (b) Asynchronously right after submit (fire-and-forget background job).
   - (c) Only when an admin clicks an "Auto-grade with AI" button on the grading hub.
   - (d) Periodic batch script (cron / manual `pnpm tsx scripts/...`).

2. **Should AI grades be auto-released to students, or do they sit as drafts until a teacher reviews?**

### Group B — What we feed the LLM
3. **Do we add a `rubric` and/or `modelAnswer` field to `QuestionDocument`?** Without one of these, the LLM is grading against just the question prompt — which is doable but lower quality. Schema change = migration script.

4. **Per-test grading config**: should the test author be able to set a per-question max score / grading style (strict vs lenient), or is "0-100, balanced" enough for v1?

### Group C — Quality, safety, scope
5. **In-scope question types**: free-text only? Or do we also want LLM to grade `multi_select` with partial-credit reasoning? Or math/image questions (multimodal Gemini)?

6. **Override behavior**: if a teacher has already manually graded a question, should the AI pipeline skip it (default), overwrite it, or write to a separate "ai_suggestion" field that doesn't replace the grade?

7. **Failure handling**: if the LLM call fails / returns malformed JSON for one student, do we (a) leave that question ungraded and continue with the rest, (b) retry N times, (c) fall back to a stub "needs manual review" grade?

### Group D — Ops / observability
8. **Cost ceiling / rate-limit awareness**: any concerns about per-test or per-run LLM cost? (Affects whether we batch N questions in one prompt vs one prompt per question.)

9. **Audit / logging**: do we need to persist the raw LLM request + response (prompt, model name, tokens used) for debugging and "show your work" purposes, or is just `gradedBy = "ai:<model>"` enough?

10. **Multi-tenant / isolation**: any tenant-scoping concerns I should know about (the code I saw was all `testId`-keyed without an explicit tenant key)?

---

## Files-read receipt (per `.claude/rules/feature-development-guide.md` checkpoint)

I directly read **3** key files in full (`grade-service.ts`, `answer-service.ts`, `test-submission-service.ts`) and got a structured summary of ~12 more from an explore subagent. I have *not* yet read:

- `src/lib/grade-visibility-service.ts` (release gate)
- `src/lib/question-service.ts` (full type defs for question variants)
- `src/lib/test-status-service.ts` (status derivation logic)
- The admin grading server actions file
- The student `submitTestAction`

I can read more before brainstorming if you want — or you can answer the questions above and I'll zoom out into Phase 2 (alternatives at the widest level, then progressively zoom in into a recommended design).

**Tell me**: *continue* (answer the questions, I'll move to Phase 2), *read more first* (I'll deep-read the 5 files above), or *narrow the scope* (tell me what to focus on / cut).
