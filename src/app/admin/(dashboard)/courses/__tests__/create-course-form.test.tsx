// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createCourseAction } from "../actions";
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
  describe("Scenario: Admin successfully creates a course", () => {
    it("should show a success message after submitting with a title", async () => {
      // Setup — mock the server action to return success
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockResolvedValue({
        success: true,
        message: 'Course "Algorithms 101" created successfully',
      });
      render(<CreateCourseDialog />);
      await user.click(screen.getByRole("button", { name: "Add Course" }));

      // Action — fill the title and submit
      await user.type(screen.getByLabelText("Course Title"), "Algorithms 101");
      await user.click(screen.getByRole("button", { name: "Create Course" }));

      // Assert — the user sees the success banner
      expect(
        await screen.findByText('Course "Algorithms 101" created successfully'),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin submits without filling the title", () => {
    it("should not invoke the create action when the title is empty", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockClear();
      render(<CreateCourseDialog />);
      await user.click(screen.getByRole("button", { name: "Add Course" }));

      // Action — click submit without typing a title
      await user.click(screen.getByRole("button", { name: "Create Course" }));

      // Assert — HTML5 form validation blocks submission, so the server
      // action is never invoked. This is the user-observable outcome:
      // nothing happens (no success banner, no error banner).
      expect(createCourseAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
