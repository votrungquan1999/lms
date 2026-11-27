"use client";

import { startTransition, useActionState } from "react";
import {
  type ReleaseCorrectAnswersState,
  type ReleaseGradesState,
  releaseCorrectAnswersAction,
  releaseGradesAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import {
  GradeReleaseKind,
  type GradeReleaseState,
  gradeReleaseText,
} from "src/lib/release-state";
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
  state: GradeReleaseState;
  offerGrades: boolean;
  offerCorrectAnswers: boolean;
}

/** The grading top bar's Release ▾: the test's release state and what is left to release. */
export function ReleaseMenu({
  testId,
  courseId,
  state,
  offerGrades,
  offerCorrectAnswers,
}: ReleaseMenuProps) {
  // The actions live here, outside the menu content, so they outlive the menu closing.
  const [gradesState, releaseGrades] = useActionState<
    ReleaseGradesState | null,
    FormData
  >(releaseGradesAction, null);
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
      onSelect: () => post(releaseGrades),
    });
  }
  if (offerCorrectAnswers) {
    entries.push({
      label: "Release correct answers",
      onSelect: () => post(releaseAnswers),
    });
  }

  const failed = [gradesState, answersState].find((s) => s && !s.success);
  return (
    <ReleaseMenuView
      stateText={gradeReleaseText(state)}
      tone={CHIP_TONES[state.kind]}
      entries={entries}
      error={failed?.message ?? null}
    />
  );
}
