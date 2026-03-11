// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    it("should use monospace font for the content textarea", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      const textarea = screen.getByLabelText("Content (Markdown)");
      expect(textarea.className).toContain("font-mono");
    });

    it("should have sufficient rows for pasting markdown", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      const textarea = screen.getByLabelText("Content (Markdown)");
      const rows = Number.parseInt(textarea.getAttribute("rows") ?? "0", 10);
      expect(rows).toBeGreaterThanOrEqual(15);
    });
  });

  describe("Scenario: Both fields are required", () => {
    it("should require title and content fields", () => {
      // Setup & Action
      render(<AddQuestionForm testId="test-1" courseId="course-1" />);

      // Assert
      expect(screen.getByLabelText("Question Title")).toBeRequired();
      expect(screen.getByLabelText("Content (Markdown)")).toBeRequired();
    });
  });
});
