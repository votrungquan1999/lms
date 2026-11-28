"use client";

import { useActionState } from "react";
import {
  type MarkChoiceAnswersState,
  markChoiceAnswersAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/mark-choice-answers-action";
import { Button } from "src/components/ui/button";

interface UnmarkedChoiceAnswerProps {
  testId: string;
  courseId: string;
}

/**
 * The grade panel's body for a choice answer whose automatic marking never ran: a note and the button that marks the test's unmarked choice answers.
 */
export function UnmarkedChoiceAnswer({
  testId,
  courseId,
}: UnmarkedChoiceAnswerProps) {
  const [state, formAction, isMarking] = useActionState<
    MarkChoiceAnswersState | null,
    FormData
  >(markChoiceAnswersAction, null);

  return (
    <form
      action={formAction}
      aria-label="Score"
      className="flex flex-col items-start gap-2"
    >
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <p id="unmarked-choice-note" className="text-xs text-muted-foreground">
        Not marked yet · automatic marking did not run for this answer
      </p>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isMarking}
        aria-describedby="unmarked-choice-note"
      >
        Mark multiple-choice answers
      </Button>
      <p className="text-xs text-muted-foreground">
        Marks every unmarked multiple-choice answer in this test
      </p>
      {state && !state.success && (
        <p role="alert" className="text-sm text-destructive wrap-anywhere">
          {state.message}
        </p>
      )}
    </form>
  );
}
