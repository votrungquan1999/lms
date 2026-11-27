"use client";

import { useState, useTransition } from "react";
import { releaseTestAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import {
  ReleaseDialogView,
  type ReleaseMode,
  type ReleaseStudentCounts,
} from "./release-dialog.ui";
import type { ReleaseStudent } from "./release-students";

interface ReleaseDialogProps {
  testId: string;
  courseId: string;
  testTitle: string;
  counts: ReleaseStudentCounts;
  students: ReleaseStudent[];
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
  students,
  offerCorrectAnswers,
  choiceQuestionCount,
  open,
  onOpenChange,
}: ReleaseDialogProps) {
  const [mode, setMode] = useState<ReleaseMode>("whole");
  const [chosenIds, setChosenIds] = useState<ReadonlySet<string>>(new Set());
  const [alsoCorrectAnswers, setAlsoCorrectAnswers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The dialog stays mounted, so closing clears the tick and the last failure for the next opening.
  function changeOpen(next: boolean) {
    if (!next) {
      setMode("whole");
      setChosenIds(new Set());
      setAlsoCorrectAnswers(false);
      setError(null);
    }
    onOpenChange(next);
  }

  function toggleChosen(studentId: string, checked: boolean) {
    setChosenIds((current) => {
      const next = new Set(current);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  }

  function release() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    form.set("mode", mode);
    if (mode === "chosen") {
      for (const id of chosenIds) form.append("studentId", id);
    }
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
      students={students}
      offerCorrectAnswers={offerCorrectAnswers}
      choiceQuestionCount={choiceQuestionCount}
      chosenIds={chosenIds}
      onChosenChange={toggleChosen}
      onSelectAllGraded={(ids) => setChosenIds(new Set(ids))}
      mode={mode}
      onModeChange={setMode}
      alsoCorrectAnswers={alsoCorrectAnswers}
      onAlsoCorrectAnswersChange={setAlsoCorrectAnswers}
      pending={pending}
      error={error}
      onSubmit={release}
    />
  );
}
