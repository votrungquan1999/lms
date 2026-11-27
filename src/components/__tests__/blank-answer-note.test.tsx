// @vitest-environment jsdom
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlankAnswerNote } from "../blank-answer-note.ui";
import { McReadOnlyScore } from "../mc-read-only-score.ui";

/**
 * Feature: one shared blank-answer note across question types
 * As an admin grading a test
 * I want a blank multiple-choice question to read exactly like a blank
 * free-text question
 * So that the wording and styling never drift between question types
 */

describe("Feature: shared blank-answer note", () => {
  describe("Scenario: a blank MC question and a blank free-text question, both unsubmitted", () => {
    it("should render the MC blank note as the same element and style as the free-text blank note", () => {
      // Given a blank, unsubmitted MC question and a blank, unsubmitted free-text question
      const { container: mcContainer } = render(
        <McReadOnlyScore selectedIds={[]} score={null} isSubmitted={false} />,
      );
      const { container: freeTextContainer } = render(
        <BlankAnswerNote isSubmitted={false} score={null} />,
      );

      // When reading each one's blank note
      const mcNote = within(mcContainer).getByText("No answer submitted");
      const freeTextNote = within(freeTextContainer).getByText(
        "No answer submitted",
      );

      // Then they render as the same element with the same style
      expect(mcNote.tagName).toBe(freeTextNote.tagName);
      expect(mcNote.className).toBe(freeTextNote.className);
    });
  });
});
