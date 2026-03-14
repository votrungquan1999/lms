// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateCourseDialog } from "../create-course-form";

vi.mock("../actions", () => ({
  createCourseAction: vi.fn(),
}));

/**
 * Feature: Course Creation Dialog
 * As an admin
 * I want a dialog to create courses
 * So that I can organize content for students
 */

describe("Feature: Course Creation Dialog", () => {
  describe("Scenario: Admin sees the course creation dialog", () => {
    it("should display title and description fields with a submit button", async () => {
      // Setup & Action
      render(<CreateCourseDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Add Course" }));

      // Assert
      expect(screen.getByLabelText("Course Title")).toBeInTheDocument();
      expect(screen.getByLabelText("Description")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create Course" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Title field is required", () => {
    it("should require the title field", async () => {
      // Setup & Action
      render(<CreateCourseDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Add Course" }));

      // Assert
      expect(screen.getByLabelText("Course Title")).toBeRequired();
    });
  });

  describe("Scenario: Description field is optional", () => {
    it("should not require the description field", async () => {
      // Setup & Action
      render(<CreateCourseDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Add Course" }));

      // Assert
      expect(screen.getByLabelText("Description")).not.toBeRequired();
    });
  });
});
