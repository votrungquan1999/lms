// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { addQuestionAction } from "../actions";
import { AddQuestionForm } from "../add-question-form";

vi.mock("../actions", () => ({
  addQuestionAction: vi.fn(),
}));

/**
 * Feature: Add Question Form
 * As an admin
 * I want a form to add questions with markdown content
 * So that I can build tests with rich content
 */

describe("Feature: Add Question Form", () => {
  describe("Scenario: Admin sees the question form", () => {
    it("should display title field, content textarea, and submit button", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      expect(screen.getByLabelText("Question Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Content (Markdown)")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add Question" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Content textarea is configured for markdown", () => {
    it("should have sufficient rows for pasting markdown", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      const textarea = screen.getByLabelText("Content (Markdown)");
      const rows = Number.parseInt(textarea.getAttribute("rows") ?? "0", 10);
      expect(rows).toBeGreaterThanOrEqual(15);
    });
  });

  describe("Scenario: Admin submits without filling the title", () => {
    it("should not invoke the add action when the title is empty", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(addQuestionAction).mockClear();
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Action — click submit without typing a title
      await user.click(screen.getByRole("button", { name: "Add Question" }));

      // Assert — HTML5 form validation blocks submission, so the server
      // action is never invoked. This is the user-observable outcome:
      // nothing happens (no success banner, no error banner).
      expect(addQuestionAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
