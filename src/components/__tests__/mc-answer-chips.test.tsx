// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { McAnswerChips } from "../mc-answer-chips";

/**
 * Feature: MC Answer Chips for Student Result View
 * As a student
 * I want to see my MC selections highlighted as visual chips
 * So that I can quickly compare what I selected against the correct answers
 */

const OPTIONS = [
  { id: "opt-a", text: "Berlin", isCorrect: false },
  { id: "opt-b", text: "Paris", isCorrect: true },
  { id: "opt-c", text: "Rome", isCorrect: false },
];

describe("Feature: McAnswerChips", () => {
  describe("Scenario: Student selected the correct option", () => {
    it("should render a green chip for the correct selection", () => {
      render(<McAnswerChips selectedIds={["opt-b"]} options={OPTIONS} />);

      const chip = screen.getByTestId("mc-chip-opt-b");
      expect(chip).toHaveTextContent("Paris");
      expect(chip.className).toMatch(/green/);
    });
  });

  describe("Scenario: Student selected a wrong option", () => {
    it("should render a red chip for the wrong selection", () => {
      render(<McAnswerChips selectedIds={["opt-a"]} options={OPTIONS} />);

      const chip = screen.getByTestId("mc-chip-opt-a");
      expect(chip).toHaveTextContent("Berlin");
      expect(chip.className).toMatch(/red/);
    });
  });

  describe("Scenario: Student selected multiple options (multi-select)", () => {
    it("should render chips for each selected option with correct colouring", () => {
      render(<McAnswerChips selectedIds={["opt-a", "opt-b"]} options={OPTIONS} />);

      const wrongChip = screen.getByTestId("mc-chip-opt-a");
      const correctChip = screen.getByTestId("mc-chip-opt-b");

      expect(wrongChip.className).toMatch(/red/);
      expect(correctChip.className).toMatch(/green/);
    });
  });

  describe("Scenario: No options selected", () => {
    it("should render no chips when selectedIds is empty", () => {
      render(<McAnswerChips selectedIds={[]} options={OPTIONS} />);

      expect(screen.queryByTestId(/mc-chip/)).not.toBeInTheDocument();
    });
  });

  describe("Scenario: showCorrectAnswers reveals missed correct options", () => {
    it("should render an unselected correct option as a green-outlined 'missed' chip", () => {
      // Given the student selected the wrong answer (Berlin)
      // and the correct answer is Paris (not selected)
      render(
        <McAnswerChips
          selectedIds={["opt-a"]}
          options={OPTIONS}
          showCorrectAnswers
        />,
      );

      // Then the missed correct option should also be rendered
      const missedChip = screen.getByTestId("mc-chip-opt-b");
      expect(missedChip).toHaveTextContent("Paris");
      // It should have a distinct "missed" style (green outline, not solid green)
      expect(missedChip.className).toMatch(/green/);
      expect(missedChip.className).toMatch(/border/);
    });
  });
});
