"use client";

import { BlankAnswerNote } from "src/components/blank-answer-note.ui";

/**
 * Read-only display of an MC question's grading outcome. MC questions are
 * auto-graded on submit, so both grading surfaces show this instead of an
 * editable score/feedback/solution form.
 *
 * Keyed on the student's selection, not on `score` alone: an empty
 * `selectedIds` means no grade row was ever created (the student never
 * answered), while a non-empty selection always has a real auto-graded
 * score — including a genuine 0 for a wrong answer, which must NOT be
 * mislabeled as "not answered".
 * @param selectedIds - IDs of the options the student selected.
 * @param score - The auto-graded score (null only when unanswered).
 * @param isSubmitted - Whether the student has submitted the test. Renders
 * the shared `BlankAnswerNote` when unanswered — same wording and style as
 * free text and image.
 */
export function McReadOnlyScore({
  selectedIds,
  score,
  isSubmitted,
}: {
  selectedIds: string[];
  score: number | null;
  isSubmitted: boolean;
}) {
  if (selectedIds.length === 0) {
    // A stored score with no selection can't happen through today's MC flow
    // (auto-grading only writes a grade when the student answered), but
    // BlankAnswerNote's stored-score branch is kept for parity.
    return <BlankAnswerNote isSubmitted={isSubmitted} score={score} />;
  }

  return <p className="text-sm font-medium">Score: {score ?? 0}</p>;
}
