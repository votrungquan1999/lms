import type { McOption } from "src/lib/question-service";

interface McAnswerChipsProps {
  /** IDs the student selected */
  selectedIds: string[];
  /** All options for the question, each with isCorrect */
  options: McOption[];
  /**
   * Whether a selected chip is coloured to show if that pick is right or
   * wrong. Required (no default) so a future caller can't silently fall
   * into the unsafe "reveal" path — when false, every selected chip renders
   * neutral regardless of showMissedCorrect.
   */
  colorPicks: boolean;
  /**
   * Whether an unselected-but-correct option also renders, as an outlined
   * "missed" chip. Required for the same reason as colorPicks — independent
   * of it, since a caller may want picks coloured without also revealing
   * which correct option the student missed (e.g. a view that already shows
   * the full answer key elsewhere).
   */
  showMissedCorrect: boolean;
}

/**
 * Renders the student's MC selections as coloured chips. Each chip exposes a
 * semantic `data-state` attribute so tests can assert on the chip's meaning
 * rather than its visual classes:
 * - data-state="selected-correct" → solid green (selected and correct)
 * - data-state="selected-wrong"   → solid red   (selected but wrong)
 * - data-state="selected-neutral" → grey (selected; colorPicks is false)
 * - data-state="missed-correct"   → green outline (correct, not selected;
 *   only rendered when showMissedCorrect is true)
 *
 * Not-selected options are not rendered unless showMissedCorrect is true
 * (in which case unselected correct options are shown with an outline style).
 */
export function McAnswerChips({
  selectedIds,
  options,
  colorPicks,
  showMissedCorrect,
}: McAnswerChipsProps) {
  const selectedSet = new Set(selectedIds);

  // Build the list of chips to render
  const chips: { option: McOption; isSelected: boolean }[] = [];

  for (const option of options) {
    const isSelected = selectedSet.has(option.id);
    if (isSelected) {
      chips.push({ option, isSelected: true });
    } else if (showMissedCorrect && option.isCorrect) {
      chips.push({ option, isSelected: false });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ option, isSelected }) => {
        let className: string;
        let chipState:
          | "selected-correct"
          | "selected-wrong"
          | "selected-neutral"
          | "missed-correct";
        if (isSelected && !colorPicks) {
          // Selected, correctness withheld → grey "your pick", regardless
          // of whether the pick is actually right — nothing may hint at it.
          chipState = "selected-neutral";
          className =
            "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground";
        } else if (isSelected && option.isCorrect) {
          // Selected + correct → solid green
          chipState = "selected-correct";
          className =
            "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
        } else if (isSelected && !option.isCorrect) {
          // Selected + wrong → solid red
          chipState = "selected-wrong";
          className =
            "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
        } else {
          // Not selected + correct (missed) → green outline
          chipState = "missed-correct";
          className =
            "border border-green-300 text-green-700 dark:border-green-700 dark:text-green-300";
        }

        return (
          <span
            key={option.id}
            data-testid={`mc-chip-${option.id}`}
            data-state={chipState}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
          >
            {option.text}
          </span>
        );
      })}
    </div>
  );
}
