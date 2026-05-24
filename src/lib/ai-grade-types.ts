/**
 * Model identifier persisted with each suggestion row. Used in both the
 * `model` column (raw model name) and the `gradedBy` audit column
 * (prefixed with `ai:`) so it lines up with the human-authored convention
 * used by GradeService.
 */
export const AI_MODEL_NAME = "gemini-2.5-flash";

/**
 * Audit string written to `gradedBy` on every AI suggestion row. Mirrors the
 * `"system"` convention used by `GradeService.autoGradeTest` for MC grading.
 */
export const AI_GRADER_ID = `ai:${AI_MODEL_NAME}`;

/**
 * Suggestion document stored in the `ai_grade` collection.
 *
 * Append-only: every suggestion is a fresh row; `score`, `feedback`,
 * `gradedAgainstAnswerId`, and `regenerateReason` are immutable after insert.
 * Only `appliedAt` / `appliedBy` mutate (see Step 6's apply path).
 */
export interface AiGradeSuggestionDocument {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  score: number;
  feedback: string;
  /** Snapshot of the answer the AI was shown — drives the stale check (Step 8). */
  gradedAgainstAnswerId: string;
  /** Raw model name, e.g. `"gemini-2.5-flash"`. */
  model: string;
  /** Audit string mirroring `gradedBy` on the human grade collection. */
  gradedBy: string;
  /** Admin who triggered the generate/regenerate click. */
  generatedByAdminId: string;
  generatedAt: Date;
  /** Reason provided by the admin on regenerate. Null on initial generation. */
  regenerateReason: string | null;
  /** Set when this suggestion has been promoted via Apply (Step 6). */
  appliedAt: Date | null;
  /** Admin who clicked Apply on this row. Null until applied. */
  appliedBy: string | null;
}

/**
 * Client-facing suggestion shape returned to UI / actions.
 */
export interface AiGradeSuggestion {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  score: number;
  feedback: string;
  gradedAgainstAnswerId: string;
  model: string;
  generatedAt: Date;
  regenerateReason: string | null;
  appliedAt: Date | null;
  appliedBy: string | null;
}
