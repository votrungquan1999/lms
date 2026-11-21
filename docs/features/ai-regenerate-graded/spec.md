# AI regenerate: teacher's note and graded questions

When a teacher regenerates AI grading suggestions, their note steers the suggested solution, and they can regenerate questions they have already graded.

## Behaviors

- **The teacher's note steers the solution.** On regenerate, the note is stated as the class's teaching context and overrides every other prompt rule. If it names a technique the students learn, the solution must use it, even over the smallest-edit rule. The prior solution is shown as rejected, so the model rewrites it instead of repeating it. Without a note the prompt is unchanged.
- **Single-question regenerate always runs.** Regenerating one question gives a fresh suggestion even when the teacher already graded it.
- **Regenerate all can include graded questions.** The dialog has an unticked-by-default checkbox, "Also regenerate questions I've already graded". Unticked, graded questions are skipped as before.
- **Regenerate never changes the teacher's grade.** New suggestions are appended rows; the saved grade changes only when the teacher clicks Apply.
- **No fake success.** If Regenerate all has nothing to regenerate, the teacher sees why:
  - box unticked: "Every question already has your grade. Tick the box to regenerate them anyway."
  - box ticked: "This student has no written answers to regenerate."
- **The first "Auto-grade with AI" still skips graded questions.**

## Key files

- `src/lib/ai/grading-prompt.ts` — regenerate prompt wording
- `src/lib/ai-grade-service.ts` — `includeGraded` on the shared candidate filter; `regenerateForQuestion` always includes graded questions; `regenerateForStudent` takes the checkbox value
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grade-actions.ts` — reads the `includeGraded` checkbox; empty-round messages
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/regenerate-with-ai-dialog.tsx` — the checkbox

## Tests

- `src/lib/ai/__tests__/grading-prompt.test.ts`
- `src/lib/__tests__/ai-grade-service.test.ts` (regenerate graded question; regenerate all with graded included)
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/__tests__/ai-grade-actions.test.ts`
- `src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/__tests__/auto-grade-with-ai-button.test.tsx`

## Background

Found on 2026-11-20 from production logs and data: a regenerate with the note "students check sqrt with `while i * i < x`" returned the identical solution, and regenerates on graded questions silently did nothing while reporting success.

Checked with one real Gemini request on 2026-11-21, replaying that regenerate with the new prompt: both prime-check solutions switched to `while j * j <= i` / `while i * i <= n`, and the already-correct answer kept score 100 with no solution.

Branch: `feat/ai-regenerate-graded`.
