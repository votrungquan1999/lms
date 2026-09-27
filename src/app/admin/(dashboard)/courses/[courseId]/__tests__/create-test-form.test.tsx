// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createTestAction } from "../actions";
import { CreateTestDialog } from "../create-test-form";

vi.mock("../actions", () => ({
  createTestAction: vi.fn(),
}));

/**
 * Feature: Create Test dialog keeps what the teacher entered
 */
describe("Feature: Create Test dialog", () => {
  describe("Scenario: Admin's refused submit keeps what they typed", () => {
    it("keeps the typed title and the show-grades checkbox after a refused submit", async () => {
      // Setup — mock the server action to return a refusal.
      const user = userEvent.setup();
      vi.mocked(createTestAction).mockResolvedValue({
        success: false,
        message: "Unauthorized: admin access required",
      });
      render(<CreateTestDialog courseId="course-1" />);
      await user.click(screen.getByRole("button", { name: "Add Test" }));

      // Action — type a title, untick "show grades immediately", and submit.
      await user.type(screen.getByLabelText("Test Title"), "Midterm");
      await user.click(screen.getByLabelText("Show grades immediately"));
      await user.click(screen.getByRole("button", { name: "Create Test" }));
      await screen.findByText("Unauthorized: admin access required");

      // Assert — both the title and the unticked checkbox survive, read
      // right after the error appears.
      expect(screen.getByLabelText("Test Title")).toHaveValue("Midterm");
      expect(
        screen.getByLabelText("Show grades immediately"),
      ).not.toBeChecked();
    });
  });

  describe("Scenario: A successful create leaves a clean form", () => {
    it("clears the title and resets the checkbox after a successful create", async () => {
      // Setup — mock the server action to return success.
      const user = userEvent.setup();
      vi.mocked(createTestAction).mockResolvedValue({
        success: true,
        message: 'Test "Midterm" created successfully',
      });
      render(<CreateTestDialog courseId="course-1" />);
      await user.click(screen.getByRole("button", { name: "Add Test" }));

      // Action — fill the title, untick "show grades immediately", and submit.
      await user.type(screen.getByLabelText("Test Title"), "Midterm");
      await user.click(screen.getByLabelText("Show grades immediately"));
      await user.click(screen.getByRole("button", { name: "Create Test" }));
      await screen.findByText('Test "Midterm" created successfully');

      // Assert — the form is clean for the next test, box ticked again.
      expect(screen.getByLabelText("Test Title")).toHaveValue("");
      expect(screen.getByLabelText("Show grades immediately")).toBeChecked();
    });
  });

  describe("Scenario: The server refuses the title itself", () => {
    it("marks the title field invalid and names the problem next to it", async () => {
      // Setup — mock the server action to return a title field error.
      const user = userEvent.setup();
      vi.mocked(createTestAction).mockResolvedValue({
        success: false,
        message: "Test title is required",
        fieldErrors: { title: "Test title is required" },
      });
      render(<CreateTestDialog courseId="course-1" />);
      await user.click(screen.getByRole("button", { name: "Add Test" }));

      // Action — type a whitespace-only title and submit.
      await user.type(screen.getByLabelText("Test Title"), "   ");
      await user.click(screen.getByRole("button", { name: "Create Test" }));

      // Assert — the input itself carries the error, and the form-level
      // banner doesn't repeat it.
      const titleInput = await screen.findByLabelText("Test Title");
      expect(titleInput).toHaveAttribute("aria-invalid", "true");
      expect(titleInput).toHaveAccessibleDescription("Test title is required");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Closing and reopening the dialog abandons the last attempt", () => {
    it("shows a fresh form with no stale success banner after reopening", async () => {
      const user = userEvent.setup();
      vi.mocked(createTestAction).mockResolvedValue({
        success: true,
        message: 'Test "Midterm" created successfully',
      });
      render(<CreateTestDialog courseId="course-1" />);
      await user.click(screen.getByRole("button", { name: "Add Test" }));
      await user.type(screen.getByLabelText("Test Title"), "Midterm");
      await user.click(screen.getByRole("button", { name: "Create Test" }));
      await screen.findByText('Test "Midterm" created successfully');
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Add Test" }));

      expect(
        screen.queryByText('Test "Midterm" created successfully'),
      ).not.toBeInTheDocument();
    });
  });
});
