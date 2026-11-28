// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnmarkedChoiceAnswer } from "src/app/admin/(dashboard)/grading/page-body/unmarked-choice-answer.ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markChoiceAnswersAction } = vi.hoisted(() => ({
  markChoiceAnswersAction: vi.fn(),
}));

vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/mark-choice-answers-action",
  () => ({ markChoiceAnswersAction }),
);

beforeEach(() => {
  markChoiceAnswersAction.mockReset();
});

describe("Feature: the unmarked choice answer's marking button", () => {
  it("sends the test and course in one action call and stays disabled while it runs", async () => {
    // Given a marking run that has not finished
    let finish: (state: { success: boolean; message: string }) => void =
      () => {};
    markChoiceAnswersAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<UnmarkedChoiceAnswer testId="test-1" courseId="course-1" />);

    // When the teacher presses the button
    await user.click(
      screen.getByRole("button", { name: "Mark multiple-choice answers" }),
    );

    // Then one action call carries the ids and the button is disabled until it ends
    expect(markChoiceAnswersAction).toHaveBeenCalledTimes(1);
    const formData = markChoiceAnswersAction.mock.calls[0][1] as FormData;
    expect(formData.get("testId")).toBe("test-1");
    expect(formData.get("courseId")).toBe("course-1");
    expect(
      screen.getByRole("button", { name: "Mark multiple-choice answers" }),
    ).toBeDisabled();
    finish({ success: true, message: "Choice answers marked" });
  });

  it("says marking did not finish and keeps the button for a retry when the action fails", async () => {
    markChoiceAnswersAction.mockResolvedValue({
      success: false,
      message: "Marking did not finish. You can try again.",
    });
    const user = userEvent.setup();
    render(<UnmarkedChoiceAnswer testId="test-1" courseId="course-1" />);

    await user.click(
      screen.getByRole("button", { name: "Mark multiple-choice answers" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Marking did not finish. You can try again.",
    );
    expect(
      screen.getByRole("button", { name: "Mark multiple-choice answers" }),
    ).toBeEnabled();
  });
});
