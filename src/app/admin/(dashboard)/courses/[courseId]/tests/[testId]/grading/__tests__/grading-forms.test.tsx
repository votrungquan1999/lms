// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";
import { gradeQuestionAction } from "../actions";
import { CompactGradeForm } from "../grading-forms";

vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  releaseCorrectAnswersAction: vi.fn(),
  requestRedoAction: vi.fn(),
  saveAndJumpToNextAction: vi.fn(),
}));

const BASE_PROPS = {
  testId: "test-1",
  courseId: "course-1",
  questionId: "q-1",
  studentId: "student-1",
  questionTitle: "Capital of France?",
  questionOrder: 1,
  existingScore: null,
  existingFeedback: null,
  existingSolution: null,
};

describe("Feature: InProgress confirm dialog", () => {
  describe("Scenario: Admin grades an InProgress student", () => {
    it("should show a confirm dialog before submitting; cancel aborts the form action, confirm proceeds", async () => {
      // The call counts below must not include other tests' calls.
      vi.mocked(gradeQuestionAction).mockClear();
      const user = userEvent.setup();
      render(
        <CompactGradeForm
          {...BASE_PROPS}
          studentStatus={TestStatus.InProgress}
        />,
      );

      // Fill in the score so the form would normally submit
      const scoreInput = screen.getByLabelText(/Score/);
      await user.clear(scoreInput);
      await user.type(scoreInput, "80");

      // Click the gated submit button
      await user.click(screen.getByRole("button", { name: /Save Grade/i }));

      // Dialog should appear
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent(/hasn.?t submitted/i);

      // Cancel — form should not actually submit; dialog closes
      await user.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(gradeQuestionAction).not.toHaveBeenCalled();

      // Re-open and confirm — the grade must actually be submitted.
      await user.click(screen.getByRole("button", { name: /Save Grade/i }));
      await user.click(
        await screen.findByRole("button", {
          name: /Submit Anyway|Confirm/i,
        }),
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(gradeQuestionAction).toHaveBeenCalledTimes(1);
    });
  });
});
