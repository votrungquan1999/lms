// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReleaseMenu } from "src/app/admin/(dashboard)/grading/page-body/release-menu";
import { GradeReleaseKind } from "src/lib/release-state";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` — `vi.mock` is lifted above every top-level const, so a plain
// one would still be uninitialised when the factory runs.
const { releaseCorrectAnswersAction } = vi.hoisted(() => ({
  releaseCorrectAnswersAction: vi.fn(),
}));

vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction,
  }),
);

beforeEach(() => {
  releaseCorrectAnswersAction.mockReset();
  releaseCorrectAnswersAction.mockResolvedValue({
    success: true,
    message: "Correct answers released",
  });
});

describe("Feature: the release-correct-answers entry of Release ▾", () => {
  it("releases the correct answers for the test it was given", async () => {
    const user = userEvent.setup();
    render(
      <ReleaseMenu
        testId="test-1"
        courseId="course-1"
        testTitle="Midterm"
        counts={{
          graded: 0,
          waiting: 0,
          stillWriting: 0,
          redoRequested: 0,
          notStarted: 0,
        }}
        students={[]}
        choiceQuestionCount={0}
        state={{ kind: GradeReleaseKind.Released }}
        offerGrades={false}
        offerCorrectAnswers
      />,
    );

    await user.click(screen.getByRole("button", { name: /^release/i }));
    await user.click(
      await screen.findByRole("menuitem", { name: /release correct answers/i }),
    );

    expect(releaseCorrectAnswersAction).toHaveBeenCalledTimes(1);
    // The ids must reach the action, or the teacher would release nothing (or
    // the wrong test) while the UI reported success.
    const formData = releaseCorrectAnswersAction.mock.calls[0][1] as FormData;
    expect(formData.get("testId")).toBe("test-1");
    expect(formData.get("courseId")).toBe("course-1");
  });
});
