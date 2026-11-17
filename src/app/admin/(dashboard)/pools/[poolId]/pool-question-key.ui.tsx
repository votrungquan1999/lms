import type { PoolQuestion } from "src/lib/pool-question-service";
import {
  ANSWER_REVEAL_MODE_HEADING,
  ANSWER_REVEAL_MODE_INHERIT_LABEL,
  ANSWER_REVEAL_MODE_LABELS,
  MC_GRADING_STRATEGY_LABELS,
  QUESTION_TYPE_LABELS,
} from "src/lib/question-labels";
import { isMcQuestionType } from "src/lib/question-service";

interface PoolQuestionKeyProps {
  /** The Question Bank question to describe. */
  question: PoolQuestion;
}

/**
 * Teacher-only strip under a Question Bank question's preview: its answer
 * key and settings, which the student's card never shows.
 * @param props - The pool question to describe.
 * @returns The strip element.
 */
export function PoolQuestionKey({
  question,
}: PoolQuestionKeyProps): React.ReactNode {
  if (question.type === "free_text") {
    return (
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Model answer:</span>{" "}
          {question.referenceAnswer ?? (
            <span className="text-muted-foreground">None</span>
          )}
        </p>
        <p>
          <span className="font-medium">Explanation:</span>{" "}
          {question.explanation ?? (
            <span className="text-muted-foreground">None</span>
          )}
        </p>
        <p>
          <span className="font-medium">{ANSWER_REVEAL_MODE_HEADING}:</span>{" "}
          {question.answerRevealMode
            ? ANSWER_REVEAL_MODE_LABELS[question.answerRevealMode]
            : ANSWER_REVEAL_MODE_INHERIT_LABEL}
        </p>
      </div>
    );
  }

  if (isMcQuestionType(question.type)) {
    return (
      <div className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Type:</span>{" "}
          {QUESTION_TYPE_LABELS[question.type]}
        </p>
        {question.type === "multi_select" && (
          <p>
            <span className="font-medium">Grading:</span>{" "}
            {MC_GRADING_STRATEGY_LABELS[question.mcGradingStrategy]}
          </p>
        )}
        <ul className="list-inside list-disc">
          {question.options.map((option) => (
            <li key={option.id}>
              {option.text}
              {option.isCorrect && " (correct)"}
            </li>
          ))}
        </ul>
        {question.explanation && (
          <p>
            <span className="font-medium">Explanation:</span>{" "}
            {question.explanation}
          </p>
        )}
      </div>
    );
  }

  return null;
}
