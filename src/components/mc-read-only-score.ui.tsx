"use client";

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
 */
export function McReadOnlyScore({
  selectedIds,
  score,
}: {
  selectedIds: string[];
  score: number | null;
}) {
  if (selectedIds.length === 0) {
    return (
      <p className="text-sm font-medium text-muted-foreground">
        Not answered — 0
      </p>
    );
  }

  return <p className="text-sm font-medium">Score: {score ?? 0}</p>;
}
