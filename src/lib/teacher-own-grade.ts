import type { AiGradeSuggestion } from "src/lib/ai-grade-types";

/** The saved grade fields a suggestion is compared with. */
export interface SavedGradeContent {
  score: number;
  feedback: string;
  solution?: string | null;
}

type SuggestionContent = Pick<
  AiGradeSuggestion,
  "score" | "feedback" | "solution" | "appliedAt"
>;

/**
 * A suggestion reads "Used" while it was applied and the saved grade still equals it.
 * Compared by content because the grade write lands just after `appliedAt`.
 * A suggestion without a fix equals a grade with no solution, because applying it clears the solution.
 */
export function suggestionReadsUsed(
  suggestion: SuggestionContent,
  grade: SavedGradeContent | null | undefined,
): boolean {
  if (!grade || suggestion.appliedAt === null) return false;
  return (
    grade.score === suggestion.score &&
    grade.feedback === suggestion.feedback &&
    (grade.solution || null) === (suggestion.solution || null)
  );
}

/**
 * The teacher's own grade: a grade exists and no suggestion on the question reads "Used".
 * Replacing it with a suggestion needs the teacher's confirmation.
 */
export function isTeacherOwnGrade(
  suggestions: SuggestionContent[],
  grade: SavedGradeContent | null | undefined,
): boolean {
  if (!grade) return false;
  return !suggestions.some((s) => suggestionReadsUsed(s, grade));
}
