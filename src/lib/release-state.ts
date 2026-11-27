import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";

export enum GradeReleaseKind {
  ShownOnSubmit = "shown-on-submit",
  Released = "released",
  ReleasedToSome = "released-to-some",
  NotReleased = "not-released",
}

export type GradeReleaseState =
  | {
      kind:
        | GradeReleaseKind.ShownOnSubmit
        | GradeReleaseKind.Released
        | GradeReleaseKind.NotReleased;
    }
  | {
      kind: GradeReleaseKind.ReleasedToSome;
      releasedTo: number;
      fullyGraded: number;
    };

/**
 * Whether students can see their grades: on submit, for the whole test,
 * for some graded students, or not at all.
 * @param test - The test with its release settings.
 * @param counts - Graded students who can see their grade, and all graded students.
 */
export function gradeReleaseState(
  test: Pick<Test, "showGradeAfterSubmit" | "gradesReleasedAt">,
  counts: { releasedTo: number; fullyGraded: number },
): GradeReleaseState {
  if (test.showGradeAfterSubmit) {
    return { kind: GradeReleaseKind.ShownOnSubmit };
  }
  if (test.gradesReleasedAt) return { kind: GradeReleaseKind.Released };
  if (counts.releasedTo > 0) {
    return {
      kind: GradeReleaseKind.ReleasedToSome,
      releasedTo: counts.releasedTo,
      fullyGraded: counts.fullyGraded,
    };
  }
  return { kind: GradeReleaseKind.NotReleased };
}

/** The state's words, as the Students see column and the Release ▾ chip show them. */
export function gradeReleaseText(state: GradeReleaseState): string {
  switch (state.kind) {
    case GradeReleaseKind.ShownOnSubmit:
      return "Shown on submit";
    case GradeReleaseKind.Released:
      return "Released";
    case GradeReleaseKind.ReleasedToSome:
      return `Released to ${state.releasedTo} of ${state.fullyGraded}`;
    case GradeReleaseKind.NotReleased:
      return "Not released";
  }
}

export enum StudentReleaseOffer {
  /** Her grade can be released to her alone. */
  Release = "release",
  /** Her grade was released to her alone. */
  Released = "released",
}

/**
 * What the grading screen offers for releasing one student's grade alone.
 * @param test - The test with its release settings.
 * @param pair - The student's status, open redo and whether her grade is still hidden.
 * @returns Nothing when the test's grades are out for everyone, or she is not Graded, or her old grade is held by an open redo.
 */
export function studentReleaseOffer(
  test: Pick<Test, "showGradeAfterSubmit" | "gradesReleasedAt">,
  pair: { status: TestStatus; redoRequested: boolean; gradedHidden: boolean },
): StudentReleaseOffer | null {
  const state = gradeReleaseState(test, { releasedTo: 0, fullyGraded: 0 });
  if (state.kind !== GradeReleaseKind.NotReleased) return null;
  if (pair.status !== TestStatus.Graded || pair.redoRequested) return null;
  return pair.gradedHidden
    ? StudentReleaseOffer.Release
    : StudentReleaseOffer.Released;
}
