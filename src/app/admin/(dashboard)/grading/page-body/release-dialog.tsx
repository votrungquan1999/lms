"use client";

import { useState, useTransition } from "react";
import { releaseTestAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import {
  ReleaseDialogView,
  type ReleaseStudentCounts,
} from "./release-dialog.ui";

interface ReleaseDialogProps {
  testId: string;
  courseId: string;
  testTitle: string;
  counts: ReleaseStudentCounts;
  offerCorrectAnswers: boolean;
  choiceQuestionCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The release dialog: opened from wherever a test's grades can be released, owning nothing but its own form. */
export function ReleaseDialog({
  testId,
  courseId,
  testTitle,
  counts,
  offerCorrectAnswers,
  choiceQuestionCount,
  open,
  onOpenChange,
}: ReleaseDialogProps) {
  const [alsoCorrectAnswers, setAlsoCorrectAnswers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The dialog stays mounted, so closing clears the tick and the last failure for the next opening.
  function changeOpen(next: boolean) {
    if (!next) {
      setAlsoCorrectAnswers(false);
      setError(null);
    }
    onOpenChange(next);
  }

  function release() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    form.set("mode", "whole");
    if (offerCorrectAnswers && alsoCorrectAnswers) {
      form.set("alsoCorrectAnswers", "true");
    }
    setError(null);
    startTransition(async () => {
      const result = await releaseTestAction(null, form);
      if (result.success) changeOpen(false);
      else setError(result.message);
    });
  }

  return (
    <ReleaseDialogView
      open={open}
      onOpenChange={changeOpen}
      testTitle={testTitle}
      counts={counts}
      offerCorrectAnswers={offerCorrectAnswers}
      choiceQuestionCount={choiceQuestionCount}
      alsoCorrectAnswers={alsoCorrectAnswers}
      onAlsoCorrectAnswersChange={setAlsoCorrectAnswers}
      pending={pending}
      error={error}
      onSubmit={release}
    />
  );
}
