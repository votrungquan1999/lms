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
 * Renders the student's MC selections as coloured chips:
 * - 🟢 Green (solid)   = selected and correct
 * - 🔴 Red (solid)     = selected but wrong
 * - 🟢 Green (outline) = correct but not selected (only when showCorrectAnswers)
 *
 * Not-selected options are not rendered unless showCorrectAnswers is true
 * (in which case unselected correct options are shown with an outline style).
 */
export function McAnswerChips({ selectedIds, options, showCorrectAnswers }: McAnswerChipsProps) {
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

  if (chips.length === 0) return <></>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(({ option, isSelected }) => {
        let className: string;
        if (isSelected && option.isCorrect) {
          // Selected + correct → solid green
          className = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
        } else if (isSelected && !option.isCorrect) {
          // Selected + wrong → solid red
          className = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
        } else {
          // Not selected + correct (missed) → green outline
          className = "border border-green-300 text-green-700 dark:border-green-700 dark:text-green-300";
        }

        return (
          <span
            key={option.id}
            data-testid={`mc-chip-${option.id}`}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
          >
            {option.text}
          </span>
        );
      })}
    </div>
  );
}

