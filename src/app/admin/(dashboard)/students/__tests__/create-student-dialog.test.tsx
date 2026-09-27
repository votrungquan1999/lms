// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createStudentAction } from "../actions";
import { CreateStudentDialog } from "../create-student-dialog";

vi.mock("../actions", () => ({
  createStudentAction: vi.fn(),
}));

/**
 * Feature: Create Student dialog keeps what the admin entered
 */
describe("Feature: Create Student dialog", () => {
  describe("Scenario: Admin's refused submit keeps what they typed", () => {
    it("keeps the typed name, username and password after a refused submit", async () => {
      // Setup — mock the server action to return a refusal.
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: false,
        message: "Username already exists",
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));

      // Action — fill every field and submit, and it gets refused.
      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Create Student" }));
      await screen.findByText("Username already exists");

      // Assert — every field is still there, read right after the error
      // appears.
      expect(screen.getByLabelText("Full Name")).toHaveValue("Alice Nguyen");
      expect(screen.getByLabelText("Username")).toHaveValue("alice");
      expect(screen.getByLabelText("Password")).toHaveValue("password123");
    });
  });

  describe("Scenario: The server refuses the username itself", () => {
    it("marks the username field invalid and names the problem next to it", async () => {
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: false,
        message: "Username already exists",
        fieldErrors: { username: "Username already exists" },
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));

      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Create Student" }));

      const usernameInput = await screen.findByLabelText("Username");
      expect(usernameInput).toHaveAttribute("aria-invalid", "true");
      expect(usernameInput).toHaveAccessibleDescription(
        "Username already exists",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: The server refuses the password itself", () => {
    it("marks the password field invalid and names the problem next to it", async () => {
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: false,
        message: "Password must be at least 8 characters",
        fieldErrors: { password: "Password must be at least 8 characters" },
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));

      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "short");
      await user.click(screen.getByRole("button", { name: "Create Student" }));

      const passwordInput = await screen.findByLabelText("Password");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
      expect(passwordInput).toHaveAccessibleDescription(
        "Password must be at least 8 characters",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: A successful create leaves a clean form right away", () => {
    it("clears every field as soon as the success message appears, not only when the dialog auto-closes", async () => {
      // Setup — mock the server action to return success.
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: true,
        message: 'Student "Alice Nguyen" created successfully',
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));

      // Action — fill every field and submit.
      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Create Student" }));
      await screen.findByText('Student "Alice Nguyen" created successfully', {
        exact: false,
      });

      // Assert — the fields are already clean, well before the 3-second
      // auto-close countdown finishes.
      expect(screen.getByLabelText("Full Name")).toHaveValue("");
      expect(screen.getByLabelText("Username")).toHaveValue("");
      expect(screen.getByLabelText("Password")).toHaveValue("");
    });
  });

  describe("Scenario: Closing and reopening the dialog abandons the last attempt", () => {
    it("shows a fresh form with no stale success banner after reopening", async () => {
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: true,
        message: 'Student "Alice Nguyen" created successfully',
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));
      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Create Student" }));
      await screen.findByText('Student "Alice Nguyen" created successfully', {
        exact: false,
      });
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Add Student" }));

      expect(
        screen.queryByText(/created successfully/i),
      ).not.toBeInTheDocument();
    });

    it("shows no stale error banner after a refusal, closing and reopening", async () => {
      const user = userEvent.setup();
      vi.mocked(createStudentAction).mockResolvedValue({
        success: false,
        message: "Username already exists",
      });
      render(<CreateStudentDialog />);
      await user.click(screen.getByRole("button", { name: "Add Student" }));
      await user.type(screen.getByLabelText("Full Name"), "Alice Nguyen");
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Create Student" }));
      await screen.findByText("Username already exists");
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Add Student" }));

      expect(
        screen.queryByText("Username already exists"),
      ).not.toBeInTheDocument();
    });
  });
});
