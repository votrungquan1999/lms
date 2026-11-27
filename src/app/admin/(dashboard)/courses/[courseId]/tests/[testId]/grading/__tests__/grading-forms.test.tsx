// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { GradingMode } from "src/lib/grading-mode";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";
import { saveAndNextAction } from "../actions";
import { CompactGradeForm } from "../grading-forms";

vi.mock("../actions", () => ({
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  releaseCorrectAnswersAction: vi.fn(),
  requestRedoAction: vi.fn(),
  saveAndNextAction: vi.fn(),
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
  saveAndNext: {
    routeKind: GradingRouteKind.Hub,
    mode: GradingMode.Student,
    needsOnly: false,
    label: "Save & next",
  },
};

describe("Feature: InProgress confirm dialog", () => {
  describe("Scenario: Admin grades an InProgress student", () => {
    it("should show a confirm dialog before submitting; cancel aborts the form action, confirm proceeds", async () => {
      // The call counts below must not include other tests' calls.
      vi.mocked(saveAndNextAction).mockClear();
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
      await user.click(screen.getByRole("button", { name: /^Save & next$/ }));

      // Dialog should appear
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent(/hasn.?t submitted/i);

      // Cancel — form should not actually submit; dialog closes
      await user.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(saveAndNextAction).not.toHaveBeenCalled();

      // Re-open and confirm — the grade must actually be submitted.
      await user.click(screen.getByRole("button", { name: /^Save & next$/ }));
      await user.click(
        await screen.findByRole("button", {
          name: /Submit Anyway|Confirm/i,
        }),
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(saveAndNextAction).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Feature: Save & next while saving", () => {
  it("disables the button until the save finishes, so a second click cannot save twice", async () => {
    // Given a save that has not finished
    vi.mocked(saveAndNextAction).mockClear();
    vi.mocked(saveAndNextAction).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CompactGradeForm {...BASE_PROPS} />);
    await user.type(screen.getByLabelText(/Score/), "80");

    // When the teacher clicks Save & next
    await user.click(screen.getByRole("button", { name: "Save & next" }));

    // Then the button is disabled and the save ran once
    expect(screen.getByRole("button", { name: "Save & next" })).toBeDisabled();
    expect(saveAndNextAction).toHaveBeenCalledTimes(1);
  });
});
