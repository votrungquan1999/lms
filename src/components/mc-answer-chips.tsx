import type { McOption } from "src/lib/question-service";

interface McAnswerChipsProps {
  /** IDs the student selected */
  selectedIds: string[];
  /** All options for the question, each with isCorrect */
  options: McOption[];
  /** When true, also show correct options the student didn't select */
  showCorrectAnswers?: boolean;
}

/**
 * Renders the student's MC selections as coloured chips. Each chip exposes a
 * semantic `data-state` attribute so tests can assert on the chip's meaning
 * rather than its visual classes:
 * - data-state="selected-correct" → solid green (selected and correct)
 * - data-state="selected-wrong"   → solid red   (selected but wrong)
 * - data-state="missed-correct"   → green outline (correct, not selected;
 *   only rendered when showCorrectAnswers is true)
 *
 * Not-selected options are not rendered unless showCorrectAnswers is true
 * (in which case unselected correct options are shown with an outline style).
 */
export function McAnswerChips({
  selectedIds,
  options,
  showCorrectAnswers,
}: McAnswerChipsProps) {
  const selectedSet = new Set(selectedIds);

  // Build the list of chips to render
  const chips: { option: McOption; isSelected: boolean }[] = [];

  for (const option of options) {
    const isSelected = selectedSet.has(option.id);
    if (isSelected) {
      chips.push({ option, isSelected: true });
    } else if (showCorrectAnswers && option.isCorrect) {
      chips.push({ option, isSelected: false });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ option, isSelected }) => {
        let className: string;
        let chipState: "selected-correct" | "selected-wrong" | "missed-correct";
        if (isSelected && option.isCorrect) {
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
