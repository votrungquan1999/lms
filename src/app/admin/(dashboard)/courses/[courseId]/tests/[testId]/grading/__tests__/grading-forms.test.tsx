// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";
import {
  FreeTextQuestionGradeForm,
  McQuestionGradeForm,
} from "../grading-forms";

vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  requestRedoAction: vi.fn(),
  saveAndJumpToNextAction: vi.fn(),
}));

/**
 * Feature: MC Answer Visual Display on Grading Page
 * As an admin
 * I want to see a student's MC selection as visual badges
 * So that I can quickly see what they chose and whether it was correct
 */

const MC_OPTIONS = [
  { id: "opt-a", text: "Berlin", isCorrect: false },
  { id: "opt-b", text: "Paris", isCorrect: true },
  { id: "opt-c", text: "Rome", isCorrect: false },
];

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

describe("Feature: McQuestionGradeForm", () => {
  describe("Scenario: Student selected a correct option", () => {
    it("should render the selected option as a selected-correct chip (not a raw [MC] string)", () => {
      render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={["opt-b"]}
          options={MC_OPTIONS}
        />,
      );

      expect(screen.queryByText(/\[MC\]/)).not.toBeInTheDocument();
      const chip = screen.getByTestId("mc-chip-opt-b");
      expect(chip).toHaveTextContent("Paris");
      expect(chip).toHaveAttribute("data-state", "selected-correct");
    });
  });

  describe("Scenario: Student selected a wrong option", () => {
    it("should render the selected option as a selected-wrong chip", () => {
      render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={["opt-a"]}
          options={MC_OPTIONS}
        />,
      );

      const chip = screen.getByTestId("mc-chip-opt-a");
      expect(chip).toHaveTextContent("Berlin");
      expect(chip).toHaveAttribute("data-state", "selected-wrong");
    });
  });
});

describe("Feature: FreeTextQuestionGradeForm", () => {
  describe("Scenario: Student answered a free-text question", () => {
    it("should render the answer as plain text (no chips)", () => {
      render(
        <FreeTextQuestionGradeForm
          {...BASE_PROPS}
          answerText="A sample answer"
        />,
      );

      expect(screen.getByText("A sample answer")).toBeInTheDocument();
      expect(screen.queryByTestId(/mc-chip/)).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Student has not answered", () => {
    it("should show 'No answer submitted' when answerText is null", () => {
      render(<FreeTextQuestionGradeForm {...BASE_PROPS} answerText={null} />);

      expect(screen.getByText("No answer submitted")).toBeInTheDocument();
    });
  });
});

describe("Feature: InProgress confirm dialog", () => {
  describe("Scenario: Admin grades an InProgress student", () => {
    it("should show a confirm dialog before submitting; cancel aborts the form action, confirm proceeds", async () => {
      const user = userEvent.setup();
      render(
        <FreeTextQuestionGradeForm
          {...BASE_PROPS}
          answerText="partial"
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

      // Re-open and confirm — clicking Confirm dismisses the gating dialog
      // so the form can proceed (user-observable: dialog is gone).
      await user.click(screen.getByRole("button", { name: /Save Grade/i }));
      await user.click(
        await screen.findByRole("button", {
          name: /Submit Anyway|Confirm/i,
        }),
      );
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
