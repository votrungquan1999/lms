// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestStatus } from "src/lib/test-status-service";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ai-grade-actions", () => ({
  autoGradeSubmissionAction: vi.fn(),
  regenerateSubmissionAction: vi.fn(),
}));

import { AutoGradeWithAiButton } from "../auto-grade-with-ai-button";

/**
 * Feature: Regenerate Dialog UI (Step 5 follow-up)
 * As a teacher
 * I want a button that morphs to "Regenerate" once AI suggestions exist
 * So that I can request a fresh round of suggestions with a reason
 */
describe("Feature: AutoGradeWithAiButton — morphs to Regenerate when suggestions exist", () => {
  describe("Scenario: hasExistingSuggestions=true on a Submitted submission", () => {
    it("shows label 'Regenerate' and opens a dialog with a reason textarea and submit button on click", async () => {
      // Given — a submission already has prior AI suggestions
      render(
        <AutoGradeWithAiButton
          testId="test-1"
          courseId="course-1"
          studentId="stu-1"
          status={TestStatus.Submitted}
          hasExistingSuggestions={true}
        />,
      );

      // Then — the trigger button is labelled "Regenerate" (not "Auto-grade")
      const trigger = screen.getByRole("button", { name: /regenerate/i });
      expect(trigger).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /auto-grade with ai/i }),
      ).not.toBeInTheDocument();

      // When — the teacher clicks Regenerate
      const user = userEvent.setup();
      await user.click(trigger);

      // Then — a dialog opens with a textarea labelled with /reason/i
      const reasonField = await screen.findByLabelText(/reason/i);
      expect(reasonField.tagName).toBe("TEXTAREA");

      // Then — the dialog has a submit button labelled /regenerate|submit/i.
      // Use getAllByRole because the trigger button (also named "Regenerate")
      // is still in the DOM; the dialog submit must be among the matches.
      const submitButtons = screen.getAllByRole("button", {
        name: /regenerate|submit/i,
      });
      const submitInsideDialog = submitButtons.some(
        (b) => b.getAttribute("type") === "submit",
      );
      expect(submitInsideDialog).toBe(true);
    });
  });
});
