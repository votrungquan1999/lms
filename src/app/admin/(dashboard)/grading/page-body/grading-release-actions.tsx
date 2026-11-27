import {
  ReleaseCorrectAnswersButton,
  ReleaseGradesButton,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/grading-forms";
import type { Test } from "src/lib/test-service";

/** The test's Release Grades and Release Correct Answers buttons, shown in the grading top bar. */
export function GradingReleaseActions({
  test,
  courseId,
}: {
  test: Test;
  courseId: string;
}) {
  return (
    <>
      {!test.showGradeAfterSubmit && (
        <ReleaseGradesButton
          testId={test.id}
          courseId={courseId}
          releasedAt={test.gradesReleasedAt}
        />
      )}
      {!test.showCorrectAnswerAfterSubmit && (
        <ReleaseCorrectAnswersButton
          testId={test.id}
          courseId={courseId}
          releasedAt={test.correctAnswersReleasedAt}
        />
      )}
    </>
  );
}
