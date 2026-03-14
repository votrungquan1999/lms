// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

  describe("Scenario: File input accepts JSON files only", () => {
    it("should accept .json files", () => {
      // Setup & Action
      render(<ImportQuestionsForm testId="test-1" courseId="course-1" />);

      // Assert
      const fileInput = screen.getByLabelText("JSON File");
      expect(fileInput).toHaveAttribute("accept", ".json");
    });
  });

  describe("Scenario: File input is required", () => {
    it("should require a file to be selected", () => {
      // Setup & Action
      render(<ImportQuestionsForm testId="test-1" courseId="course-1" />);

      // Assert
      expect(screen.getByLabelText("JSON File")).toBeRequired();
    });
  });
});
