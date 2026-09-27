"use client";

/**
 * The wording a blank answer shows — one style, shared by every question
 * type (free text, photo, multiple choice) so it never drifts between
 * them. Neutral before submit; after submit, a stored score from before
 * the question stopped being editable wins over the generic zero.
 * @param isSubmitted - Whether the student has submitted the test.
 * @param score - A stored score predating the question becoming
 * un-answerable, or null.
 */
export function BlankAnswerNote({
  isSubmitted,
  score,
}: {
  isSubmitted: boolean;
  score: number | null;
}) {
  const message = !isSubmitted
    ? "No answer submitted"
    : score !== null
      ? `No answer — scored ${score}`
      : "No answer — counts as 0";

  return <p className="text-xs italic text-muted-foreground">{message}</p>;
}
