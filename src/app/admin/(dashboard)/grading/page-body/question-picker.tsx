import { GradingMode } from "src/lib/grading-mode";
import type { Question } from "src/lib/question-service";
import { gradingHref } from "./href";
import { QuestionPickerUi } from "./question-picker.ui";

interface QuestionPickerProps {
  questions: Question[];
  /** The question on screen, or null when the test has none. */
  current: Question | null;
  basePath: string;
  needsOnly?: boolean;
}

/** The question picker for the top bar: builds each question's link, keeping the "Needs grading only" filter. */
export function QuestionPicker({
  questions,
  current,
  basePath,
  needsOnly,
}: QuestionPickerProps) {
  return (
    <QuestionPickerUi
      currentLabel={
        current ? `Q${current.order} ${current.title}` : "Pick a question"
      }
      currentId={current?.id ?? null}
      items={questions.map((question) => ({
        id: question.id,
        label: `Q${question.order} ${question.title}`,
        href: gradingHref({
          basePath,
          mode: GradingMode.Question,
          questionId: question.id,
          needsOnly,
        }),
      }))}
    />
  );
}
