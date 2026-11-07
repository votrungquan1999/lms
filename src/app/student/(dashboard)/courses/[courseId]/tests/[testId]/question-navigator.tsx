import { questionAnchorId } from "./question-anchor";
import {
  NavigatorBar,
  NavigatorBox,
  NavigatorBoxes,
  NavigatorCount,
  NavigatorSummary,
} from "./question-navigator.ui";

interface NavigatorQuestion {
  id: string;
  order: number;
}

interface QuestionNavigatorProps {
  questions: NavigatorQuestion[];
  /** Questions with a saved answer. */
  answeredIds: Set<string>;
}

/**
 * Bar pinned to the top of the test page while the student can answer: the
 * answered count and one box per question, filled once its answer is saved.
 * @param questions - The test's questions, in display order.
 * @param answeredIds - Ids of the questions whose answer is saved.
 */
export function QuestionNavigator({
  questions,
  answeredIds,
}: QuestionNavigatorProps) {
  const answeredCount = questions.filter((q) => answeredIds.has(q.id)).length;

  return (
    <NavigatorBar>
      <NavigatorSummary>
        <NavigatorCount>
          {answeredCount} / {questions.length} answered
        </NavigatorCount>
      </NavigatorSummary>
      <NavigatorBoxes>
        {questions.map((q) => {
          const answered = answeredIds.has(q.id);
          return (
            <NavigatorBox
              key={q.id}
              href={`#${questionAnchorId(q.order)}`}
              label={`Question ${q.order}, ${answered ? "answered" : "not answered"}`}
              answered={answered}
            >
              {q.order}
            </NavigatorBox>
          );
        })}
      </NavigatorBoxes>
    </NavigatorBar>
  );
}
