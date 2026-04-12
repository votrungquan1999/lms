// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FreeTextQuestionGradeForm, McQuestionGradeForm } from "../grading-forms";

vi.mock("../actions", () => ({
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
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
    it("should render the selected option as a green chip (not a raw [MC] string)", () => {
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
      expect(chip.className).toMatch(/green/);
    });
  });

  describe("Scenario: Student selected a wrong option", () => {
    it("should render the selected option as a red chip", () => {
      render(
        <McQuestionGradeForm
          {...BASE_PROPS}
          selectedIds={["opt-a"]}
          options={MC_OPTIONS}
        />,
      );

      const chip = screen.getByTestId("mc-chip-opt-a");
      expect(chip).toHaveTextContent("Berlin");
      expect(chip.className).toMatch(/red/);
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
      render(
        <FreeTextQuestionGradeForm
          {...BASE_PROPS}
          answerText={null}
        />,
      );

      expect(screen.getByText("No answer submitted")).toBeInTheDocument();
    });
  });
});
