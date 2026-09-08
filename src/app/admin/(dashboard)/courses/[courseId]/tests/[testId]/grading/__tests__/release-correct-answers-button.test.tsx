// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReleaseCorrectAnswersButton } from "../grading-forms";

// `vi.hoisted` — `vi.mock` is lifted above every top-level const, so a plain
// one would still be uninitialised when the factory runs.
const { releaseCorrectAnswersAction } = vi.hoisted(() => ({
  releaseCorrectAnswersAction: vi.fn(),
}));

vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  requestRedoAction: vi.fn(),
  releaseGradeForStudentAction: vi.fn(),
  saveAndJumpToNextAction: vi.fn(),
  releaseCorrectAnswersAction,
}));

beforeEach(() => {
  releaseCorrectAnswersAction.mockReset();
  releaseCorrectAnswersAction.mockResolvedValue({
    success: true,
    message: "Correct answers released",
  });
});

describe("Feature: the release-correct-answers control", () => {
  it("releases the correct answers for the test it was given", async () => {
    const user = userEvent.setup();
    render(<ReleaseCorrectAnswersButton testId="test-1" courseId="course-1" />);

    await user.click(
      screen.getByRole("button", { name: /release correct answers/i }),
    );

    expect(releaseCorrectAnswersAction).toHaveBeenCalledTimes(1);
    // The ids must reach the action, or the teacher would release nothing (or
    // the wrong test) while the UI reported success.
    const formData = releaseCorrectAnswersAction.mock.calls[0][1] as FormData;
    expect(formData.get("testId")).toBe("test-1");
    expect(formData.get("courseId")).toBe("course-1");
  });
});
