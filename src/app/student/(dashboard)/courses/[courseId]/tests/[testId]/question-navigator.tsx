import type { ReactNode } from "react";
import { questionAnchorId } from "./question-anchor";
import { NavigatorFoldProvider } from "./question-navigator.state";
import {
  NavigatorBar,
  NavigatorBox,
  NavigatorBoxes,
  NavigatorCount,
  NavigatorFoldPanel,
  NavigatorFoldToggle,
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
  /** The live countdown, on a timed test. */
  timer?: ReactNode;
}

/**
 * Bar pinned to the top of the test page while the student can answer: the
 * answered count and one box per question, filled once its answer is saved.
 * On phones the boxes fold behind a "Questions" button.
 * @param questions - The test's questions, in display order.
 * @param answeredIds - Ids of the questions whose answer is saved.
 * @param timer - The countdown to show beside the count, if the test is timed.
 */
export function QuestionNavigator({
  questions,
  answeredIds,
  timer,
}: QuestionNavigatorProps) {
  const answeredCount = questions.filter((q) => answeredIds.has(q.id)).length;

  return (
    <NavigatorFoldProvider>
      <NavigatorBar>
        <NavigatorSummary>
          <NavigatorCount>
            {answeredCount} / {questions.length} answered
          </NavigatorCount>
          {timer}
          <NavigatorFoldToggle>Questions</NavigatorFoldToggle>
        </NavigatorSummary>
        <NavigatorFoldPanel>
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
        </NavigatorFoldPanel>
      </NavigatorBar>
    </NavigatorFoldProvider>
  );
}
