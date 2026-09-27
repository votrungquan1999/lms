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
    it("should render a selected-correct chip for the correct selection", () => {
      render(
        <McAnswerChips
          selectedIds={["opt-b"]}
          options={OPTIONS}
          colorPicks={true}
          showMissedCorrect={true}
        />,
      );

      const chip = screen.getByTestId("mc-chip-opt-b");
      expect(chip).toHaveTextContent("Paris");
      expect(chip).toHaveAttribute("data-state", "selected-correct");
    });
  });

  describe("Scenario: Student selected a wrong option", () => {
    it("should render a selected-wrong chip for the wrong selection", () => {
      render(
        <McAnswerChips
          selectedIds={["opt-a"]}
          options={OPTIONS}
          colorPicks={true}
          showMissedCorrect={true}
        />,
      );

      const chip = screen.getByTestId("mc-chip-opt-a");
      expect(chip).toHaveTextContent("Berlin");
      expect(chip).toHaveAttribute("data-state", "selected-wrong");
    });
  });

  describe("Scenario: Student selected multiple options (multi-select)", () => {
    it("should render chips for each selected option with correct state", () => {
      render(
        <McAnswerChips
          selectedIds={["opt-a", "opt-b"]}
          options={OPTIONS}
          colorPicks={true}
          showMissedCorrect={true}
        />,
      );

      const wrongChip = screen.getByTestId("mc-chip-opt-a");
      const correctChip = screen.getByTestId("mc-chip-opt-b");

      expect(wrongChip).toHaveAttribute("data-state", "selected-wrong");
      expect(correctChip).toHaveAttribute("data-state", "selected-correct");
    });
  });

  describe("Scenario: No options selected", () => {
    it("should render no chips when selectedIds is empty", () => {
      render(
        <McAnswerChips
          selectedIds={[]}
          options={OPTIONS}
          colorPicks={false}
          showMissedCorrect={false}
        />,
      );

      expect(screen.queryByTestId(/mc-chip/)).not.toBeInTheDocument();
    });
  });

  describe("Scenario: showMissedCorrect reveals missed correct options", () => {
    it("should render an unselected correct option as a missed-correct chip", () => {
      // Given the student selected the wrong answer (Berlin)
      // and the correct answer is Paris (not selected)
      render(
        <McAnswerChips
          selectedIds={["opt-a"]}
          options={OPTIONS}
          colorPicks={true}
          showMissedCorrect={true}
        />,
      );

      // Then the missed correct option should also be rendered
      const missedChip = screen.getByTestId("mc-chip-opt-b");
      expect(missedChip).toHaveTextContent("Paris");
      // It should expose the "missed-correct" semantic state (distinct from
      // selected-correct, which uses a solid fill).
      expect(missedChip).toHaveAttribute("data-state", "missed-correct");
    });
  });

  describe("Scenario: correctness is withheld from the viewer", () => {
    it("should render the student's correct pick as neutral, not selected-correct or selected-wrong, and never show a missed-correct chip", () => {
      // Given the student picked the actually-correct option, but the
      // answer key hasn't been released to them yet
      render(
        <McAnswerChips
          selectedIds={["opt-b"]}
          options={OPTIONS}
          colorPicks={false}
          showMissedCorrect={false}
        />,
      );

      // Then their own pick reads as a neutral "your pick" chip — nothing
      // hints that it was right
      const chip = screen.getByTestId("mc-chip-opt-b");
      expect(chip).toHaveAttribute("data-state", "selected-neutral");

      // And no other option is rendered as a missed-correct chip either
      expect(screen.queryByTestId("mc-chip-opt-a")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mc-chip-opt-c")).not.toBeInTheDocument();
    });
  });
});
