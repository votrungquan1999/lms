"use client";

import { startTransition, useActionState, useState } from "react";
import {
  type ReleaseCorrectAnswersState,
  releaseCorrectAnswersAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import {
  GradeReleaseKind,
  type GradeReleaseState,
  gradeReleaseText,
} from "src/lib/release-state";
import { ReleaseDialog } from "./release-dialog";
import type { ReleaseStudentCounts } from "./release-dialog.ui";
import {
  type ReleaseChipTone,
  type ReleaseMenuEntry,
  ReleaseMenuView,
} from "./release-menu.ui";

const CHIP_TONES: Record<GradeReleaseKind, ReleaseChipTone> = {
  [GradeReleaseKind.NotReleased]: "secondary",
  [GradeReleaseKind.ReleasedToSome]: "warning",
  [GradeReleaseKind.Released]: "success",
  [GradeReleaseKind.ShownOnSubmit]: "info",
};

interface ReleaseMenuProps {
  testId: string;
  courseId: string;
  testTitle: string;
  counts: ReleaseStudentCounts;
  choiceQuestionCount: number;
  state: GradeReleaseState;
  offerGrades: boolean;
  offerCorrectAnswers: boolean;
}

/** The grading top bar's Release ▾: the test's release state and what is left to release. */
export function ReleaseMenu({
  testId,
  courseId,
  testTitle,
  counts,
  choiceQuestionCount,
  state,
  offerGrades,
  offerCorrectAnswers,
}: ReleaseMenuProps) {
  // The dialog and the action live here, outside the menu content, so they outlive the menu closing.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answersState, releaseAnswers] = useActionState<
    ReleaseCorrectAnswersState | null,
    FormData
  >(releaseCorrectAnswersAction, null);

  function post(action: (form: FormData) => void) {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    startTransition(() => action(form));
  }

  const entries: ReleaseMenuEntry[] = [];
  if (offerGrades) {
    entries.push({
      label: "Release grades…",
      description: "Students see their grades",
      onSelect: () => setDialogOpen(true),
    });
  }
  if (offerCorrectAnswers) {
    entries.push({
      label: "Release correct answers",
      description: "Students see the right answer to each question",
      onSelect: () => post(releaseAnswers),
    });
  }

  const note =
    state.kind === GradeReleaseKind.Released
      ? {
          title: "Grades released for the whole test",
          description: "Students graded later see theirs right away.",
        }
      : null;

  const failed = answersState && !answersState.success ? answersState : null;
  return (
    <>
      <ReleaseMenuView
        stateText={gradeReleaseText(state)}
        tone={CHIP_TONES[state.kind]}
        entries={entries}
        note={note}
        error={failed?.message ?? null}
      />
      <ReleaseDialog
        testId={testId}
        courseId={courseId}
        testTitle={testTitle}
        counts={counts}
        offerCorrectAnswers={offerCorrectAnswers}
        choiceQuestionCount={choiceQuestionCount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
