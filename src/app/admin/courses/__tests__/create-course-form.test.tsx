// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateCourseForm } from "../create-course-form";

vi.mock("../actions", () => ({
  createCourseAction: vi.fn(),
}));

/**
 * Feature: Course Creation Form
 * As an admin
 * I want a form to create courses
 * So that I can organize content for students
 */

describe("Feature: Course Creation Form", () => {
  describe("Scenario: Admin sees the course creation form", () => {
    it("should display title and description fields with a submit button", () => {
      // Setup & Action
      render(<CreateCourseForm />);

      // Assert
      expect(screen.getByLabelText("Course Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Description")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create Course" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Title field is required", () => {
    it("should require the title field", () => {
      // Setup & Action
      render(<CreateCourseForm />);

      // Assert
      expect(screen.getByLabelText("Course Title")).toBeRequired();
    });
  });

  describe("Scenario: Description field is optional", () => {
    it("should not require the description field", () => {
      // Setup & Action
      render(<CreateCourseForm />);

      // Assert
      expect(screen.getByLabelText("Description")).not.toBeRequired();
    });
  });
});
