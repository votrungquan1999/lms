// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createCourseAction } from "../actions";
import { CreateCourseDialog, NewCourseButton } from "../create-course-form";

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
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Action — fill the title and submit
      await user.type(screen.getByLabelText("Course title"), "Algorithms 101");
      await user.click(screen.getByRole("button", { name: "Create course" }));

      // Assert — the user sees the success banner
      expect(
        await screen.findByText('Course "Algorithms 101" created successfully'),
      ).toBeInTheDocument();
    });

    it("clears the title field after a successful create", async () => {
      // Setup — mock the server action to return success
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockResolvedValue({
        success: true,
        message: 'Course "Algorithms 101" created successfully',
      });
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Action — fill the title and submit
      await user.type(screen.getByLabelText("Course title"), "Algorithms 101");
      await user.click(screen.getByRole("button", { name: "Create course" }));
      await screen.findByText('Course "Algorithms 101" created successfully');

      // Assert — the form is clean for the next course.
      expect(screen.getByLabelText("Course title")).toHaveValue("");
    });
  });

  describe("Scenario: Admin's refused submit keeps what they typed", () => {
    it("keeps the typed title after a refused submit", async () => {
      // Setup — mock the server action to return a refusal.
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockResolvedValue({
        success: false,
        message: "Unauthorized: admin access required",
      });
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Action — type a title and submit, and it gets refused.
      await user.type(screen.getByLabelText("Course title"), "Algorithms 101");
      await user.click(screen.getByRole("button", { name: "Create course" }));
      await screen.findByText("Unauthorized: admin access required");

      // Assert — the typed title is still there, read right after the
      // error appears (typing again would mask a real reset).
      expect(screen.getByLabelText("Course title")).toHaveValue(
        "Algorithms 101",
      );
    });
  });

  describe("Scenario: Closing and reopening the dialog abandons the last attempt", () => {
    it("shows a fresh form with no stale success banner after reopening", async () => {
      // Setup — a successful submit, then close the dialog.
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockResolvedValue({
        success: true,
        message: 'Course "Algorithms 101" created successfully',
      });
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));
      await user.type(screen.getByLabelText("Course title"), "Algorithms 101");
      await user.click(screen.getByRole("button", { name: "Create course" }));
      await screen.findByText('Course "Algorithms 101" created successfully');
      await user.keyboard("{Escape}");

      // Action — reopen the dialog.
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Assert — no stale banner from the last attempt.
      expect(
        screen.queryByText('Course "Algorithms 101" created successfully'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scenario: The server refuses the title itself", () => {
    it("marks the title field invalid and names the problem next to it", async () => {
      // Setup — mock the server action to return a title field error.
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockResolvedValue({
        success: false,
        message: "Course title is required",
        fieldErrors: { title: "Course title is required" },
      });
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Action — type a whitespace-only title and submit.
      await user.type(screen.getByLabelText("Course title"), "   ");
      await user.click(screen.getByRole("button", { name: "Create course" }));

      // Assert — the input itself carries the error, the error is announced,
      // and the form-level banner doesn't repeat it. Waits, since the input
      // exists before the action's result lands.
      await waitFor(() => {
        expect(screen.getByLabelText("Course title")).toHaveAttribute(
          "aria-invalid",
          "true",
        );
      });
      expect(screen.getByLabelText("Course title")).toHaveAccessibleDescription(
        "Course title is required",
      );
      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Course title is required",
      );
    });
  });

  describe("Scenario: Admin submits without filling the title", () => {
    it("should not invoke the create action when the title is empty", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(createCourseAction).mockClear();
      render(
        <CreateCourseDialog schoolId="school-1">
          <NewCourseButton />
        </CreateCourseDialog>,
      );
      await user.click(screen.getByRole("button", { name: "New course" }));

      // Action — click submit without typing a title
      await user.click(screen.getByRole("button", { name: "Create course" }));

      // Assert — HTML5 form validation blocks submission, so the server
      // action is never invoked. This is the user-observable outcome:
      // nothing happens (no success banner, no error banner).
      expect(createCourseAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
