// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { importQuestionsAction } from "../actions";
import { ImportQuestionsForm } from "../import-questions-form";

vi.mock("../actions", () => ({
  importQuestionsAction: vi.fn(),
}));

/**
 * Feature: Import Questions Form
 * As an admin
 * I want to import questions from a JSON file
 * So that I can bulk-add questions to a test
 */

describe("Feature: Import Questions Form", () => {
  describe("Scenario: Admin sees the import form", () => {
    it("should display a file input and submit button", () => {
      // Setup & Action
      render(<ImportQuestionsForm testId="test-1" courseId="course-1" />);

      // Assert
      expect(screen.getByLabelText("JSON File")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Import Questions" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin submits without selecting a file", () => {
    it("should not invoke the import action when no file is selected", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(importQuestionsAction).mockClear();
      render(<ImportQuestionsForm testId="test-1" courseId="course-1" />);

      // Action — click submit without selecting a file
      const submitBtn = screen.getByRole("button", {
        name: "Import Questions",
      });
      await user.click(submitBtn);

      // Assert — HTML5 form validation blocks submission, so the server
      // action is never invoked. This is the user-observable outcome:
      // nothing happens (no import, no success/error banner).
      expect(importQuestionsAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
