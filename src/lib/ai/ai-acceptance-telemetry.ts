import type { Span } from "@opentelemetry/api";

/** How the final grade came about on a question the AI had graded. */
export enum AiGradeOutcome {
  /** The teacher applied the AI suggestion (possibly with edits). */
  Applied = "applied",
  /** The teacher saved their own grade instead. */
  ManuallyGraded = "manually_graded",
}

/** One side of the AI-vs-teacher comparison. */
export interface GradeSnapshot {
  score: number;
  feedback: string;
  solution?: string;
}

/**
 * Records, once per request, how the grade a teacher kept compares with the
 * AI's suggestion. Only numbers and flags — never the feedback or solution text.
 * @param span - The action's span.
 * @param outcome - Whether the suggestion was applied or overridden by hand.
 * @param suggested - The AI's suggested grade.
 * @param final - The grade the teacher kept.
 */
export function recordAiAcceptance(
  span: Span,
  outcome: AiGradeOutcome,
  suggested: GradeSnapshot,
  final: GradeSnapshot,
): void {
  span.setAttributes({
    "lms.ai.outcome": outcome,
    "lms.ai.suggestion_score": suggested.score,
    "lms.ai.final_score": final.score,
    "lms.ai.score_gap": final.score - suggested.score,
    "lms.ai.feedback_changed": final.feedback !== suggested.feedback,
    "lms.ai.solution_changed":
      (final.solution ?? "") !== (suggested.solution ?? ""),
  });
}
