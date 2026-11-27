"use client";

import { startTransition, useActionState, useState } from "react";
import {
  type ReleaseCorrectAnswersState,
  releaseCorrectAnswersAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import { Button } from "src/components/ui/button";
import { ReleaseDialog } from "./release-dialog";
import type { ReleaseStudentCounts } from "./release-dialog.ui";
import type { ReleaseStudent } from "./release-students";

interface FinishReleaseProps {
  testId: string;
  courseId: string;
  testTitle: string;
  /** Graded students who cannot see their grade yet. */
  hiddenGradeCount: number;
  /** Students cannot see the correct answers yet. */
  offerCorrectAnswers: boolean;
  counts: ReleaseStudentCounts;
  students: ReleaseStudent[];
  choiceQuestionCount: number;
}

/** The finish panel's pinned release: the grade dialog while grades are hidden, else one click for the correct answers, else nothing. */
export function FinishRelease({
  testId,
  courseId,
  testTitle,
  hiddenGradeCount,
  offerCorrectAnswers,
  counts,
  students,
  choiceQuestionCount,
}: FinishReleaseProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answersState, releaseAnswers] = useActionState<
    ReleaseCorrectAnswersState | null,
    FormData
  >(releaseCorrectAnswersAction, null);

  function releaseCorrectAnswers() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    startTransition(() => releaseAnswers(form));
  }

  if (hiddenGradeCount === 0 && !offerCorrectAnswers) return null;

  const failed = answersState && !answersState.success ? answersState : null;
  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-t pt-3"
      data-testid="finish-release"
    >
      {hiddenGradeCount > 0 ? (
        <>
          <p className="text-sm">
            {hiddenGradeCount} graded{" "}
            {hiddenGradeCount === 1
              ? "student can't see her grade"
              : "students can't see their grades"}
          </p>
          <Button type="button" onClick={() => setDialogOpen(true)}>
            Release…
          </Button>
          <ReleaseDialog
            testId={testId}
            courseId={courseId}
            testTitle={testTitle}
            counts={counts}
            students={students}
            offerCorrectAnswers={offerCorrectAnswers}
            choiceQuestionCount={choiceQuestionCount}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </>
      ) : (
        <>
          <p className="text-sm">Correct answers are still hidden</p>
          <Button type="button" onClick={releaseCorrectAnswers}>
            Release correct answers
          </Button>
        </>
      )}
      {failed && <p className="text-xs text-destructive">{failed.message}</p>}
    </div>
  );
}
