import type { Collection } from "mongodb";
import type {
  AiGradeSuggestion,
  AiGradeSuggestionDocument,
} from "src/lib/ai-grade-types";
import type { GradeDocument, GradeService } from "src/lib/grade-service";

/**
 * Input bag for `applySuggestion`. Extracted into its own file so
 * `ai-grade-service.ts` stays under the 300-line cap.
 *
 * The apply path is the only mutator of an `ai_grade` row after insert —
 * `appliedAt` / `appliedBy` are the only mutable columns on the suggestion
 * document (see ai-grade-types.ts).
 *
 * `grades` is required so the apply path can re-stamp `gradedBy` to the
 * current applier when the row already exists from a prior apply. The
 * GradeService's upsert preserves the original `gradedBy` on update —
 * acceptable for manual re-grading, but Apply's contract attributes the
 * grade to the latest applier (see Step 7 in implementation-plan.md).
 */
export interface ApplySuggestionDeps {
  suggestions: Collection<AiGradeSuggestionDocument>;
  grades: Collection<GradeDocument>;
  gradeService: GradeService;
}

/**
 * Optional overrides on apply. Resolved with `??` (NOT `||`) so `0` and `""`
 * are honored — they are valid intentional overrides per the brainstorm-3
 * design notes.
 */
export interface ApplySuggestionOverrides {
  scoreOverride?: number;
  feedbackOverride?: string;
  solutionOverride?: string;
}

/**
 * Verbatim user-facing message (pinned by implementation-plan.md). Refusal
 * fires when no `ai_grade` row currently carries `appliedAt != null` AND a
 * `grade` row already exists for `(testId, questionId, studentId)` — the grade
 * is teacher-authored and must not be silently overwritten by Apply.
 */
export const APPLY_OVER_HUMAN_GRADE_MESSAGE =
  "This question already has a teacher-authored grade. Edit the grade directly to change it.";

/**
 * Promotes an AI suggestion to the official `grade` row.
 *
 * Order (documented design trade-off — see implementation-plan.md §Atomic Apply):
 *   1. Load target suggestion by id; throw "Suggestion not found" if missing.
 *   2. Apply-over-human-grade check — refuse if a teacher already authored a
 *      grade for this question (no `ai_grade` row currently applied AND a
 *      `grade` row exists).
 *   3. Set `appliedAt` / `appliedBy` on the chosen row FIRST so the brief
 *      in-between window has at-least-one marked row, never zero.
 *   4. Clear the marker on any OTHER prior-applied sibling row for the same
 *      `(testId, questionId, studentId)`.
 *   5. Call `gradeService.gradeQuestion(...)` with overrides resolved via `??`
 *      so `0` / `""` are honored.
 *   6. Re-read and return the updated suggestion document as the client shape.
 *
 * The service contains no defensive try/catch — the action's outer try/catch
 * is the only error boundary.
 */
export async function applySuggestion(
  deps: ApplySuggestionDeps,
  suggestionId: string,
  byAdminId: string,
  overrides?: ApplySuggestionOverrides,
): Promise<AiGradeSuggestion> {
  const { suggestions, grades, gradeService } = deps;

  const target = await suggestions.findOne({ id: suggestionId });
  if (!target) {
    throw new Error("Suggestion not found");
  }

  const anyCurrentlyApplied = await suggestions.countDocuments(
    {
      testId: target.testId,
      questionId: target.questionId,
      studentId: target.studentId,
      appliedAt: { $ne: null },
    },
    { limit: 1 },
  );

  if (anyCurrentlyApplied === 0) {
    const existingGrade = await gradeService.getGrade(
      target.testId,
      target.questionId,
      target.studentId,
    );
    if (existingGrade) {
      throw new Error(APPLY_OVER_HUMAN_GRADE_MESSAGE);
    }
  }

  const now = new Date();

  await suggestions.updateOne(
    { id: suggestionId },
    { $set: { appliedAt: now, appliedBy: byAdminId } },
  );

  await suggestions.updateMany(
    {
      testId: target.testId,
      questionId: target.questionId,
      studentId: target.studentId,
      id: { $ne: suggestionId },
      appliedAt: { $ne: null },
    },
    { $set: { appliedAt: null, appliedBy: null } },
  );

  const effectiveScore = overrides?.scoreOverride ?? target.score;
  const effectiveFeedback = overrides?.feedbackOverride ?? target.feedback;
  const effectiveSolution = overrides?.solutionOverride ?? target.solution;

  await gradeService.gradeQuestion({
    testId: target.testId,
    questionId: target.questionId,
    studentId: target.studentId,
    score: effectiveScore,
    feedback: effectiveFeedback,
    solution: effectiveSolution,
    gradedBy: byAdminId,
  });

  // Re-stamp `gradedBy` to the current applier. `GradeService.gradeQuestion`
  // preserves the original `gradedBy` on update (manual-grading audit
  // semantics), but Apply attributes the grade to the most recent applier.
  await grades.updateOne(
    {
      testId: target.testId,
      questionId: target.questionId,
      studentId: target.studentId,
    },
    { $set: { gradedBy: byAdminId } },
  );

  const updated = await suggestions.findOne({ id: suggestionId });
  if (!updated) {
    throw new Error("Suggestion not found");
  }

  return {
    id: updated.id,
    testId: updated.testId,
    questionId: updated.questionId,
    studentId: updated.studentId,
    score: updated.score,
    feedback: updated.feedback,
    solution: updated.solution,
    gradedAgainstAnswerId: updated.gradedAgainstAnswerId,
    model: updated.model,
    generatedAt: updated.generatedAt,
    regenerateReason: updated.regenerateReason,
    appliedAt: updated.appliedAt,
    appliedBy: updated.appliedBy,
  };
}
