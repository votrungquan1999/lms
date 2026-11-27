import {
  GradeReleaseKind,
  gradeReleaseState,
  gradeReleaseText,
} from "src/lib/release-state";
import { describe, expect, it } from "vitest";

const counts = { releasedTo: 0, fullyGraded: 3 };

describe("gradeReleaseState", () => {
  it("is Not released when nothing is shown to anyone", () => {
    const state = gradeReleaseState(
      { showGradeAfterSubmit: false, gradesReleasedAt: null },
      counts,
    );

    expect(state).toEqual({ kind: GradeReleaseKind.NotReleased });
    expect(gradeReleaseText(state)).toBe("Not released");
  });

  it("counts the released students when only some can see their grade", () => {
    const state = gradeReleaseState(
      { showGradeAfterSubmit: false, gradesReleasedAt: null },
      { releasedTo: 2, fullyGraded: 5 },
    );

    expect(state).toEqual({
      kind: GradeReleaseKind.ReleasedToSome,
      releasedTo: 2,
      fullyGraded: 5,
    });
    expect(gradeReleaseText(state)).toBe("Released to 2 of 5");
  });

  it("is Released once the whole test was released, even when no student is counted yet", () => {
    const state = gradeReleaseState(
      { showGradeAfterSubmit: false, gradesReleasedAt: new Date() },
      counts,
    );

    expect(state).toEqual({ kind: GradeReleaseKind.Released });
    expect(gradeReleaseText(state)).toBe("Released");
  });

  it("is Shown on submit whenever the test shows grades on submit, whatever else is set", () => {
    const state = gradeReleaseState(
      { showGradeAfterSubmit: true, gradesReleasedAt: new Date() },
      { releasedTo: 2, fullyGraded: 5 },
    );

    expect(state).toEqual({ kind: GradeReleaseKind.ShownOnSubmit });
    expect(gradeReleaseText(state)).toBe("Shown on submit");
  });

  it("prefers Released over a partial count when both apply", () => {
    const state = gradeReleaseState(
      { showGradeAfterSubmit: false, gradesReleasedAt: new Date() },
      { releasedTo: 2, fullyGraded: 5 },
    );

    expect(state.kind).toBe(GradeReleaseKind.Released);
  });
});
