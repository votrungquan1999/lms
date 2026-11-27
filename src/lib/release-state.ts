import type { Test } from "src/lib/test-service";

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
