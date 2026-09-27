// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { authClient } from "src/lib/auth-client";
import { describe, expect, it, vi } from "vitest";
import { StudentLoginForm } from "../student-login-form";

// Mock next/navigation — not available in jsdom
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the auth client — can't make real auth calls in jsdom
vi.mock("src/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
  },
}));

/**
 * Feature: Student Login Form
 * As a student
 * I want a login form with username and password
 * So that I can sign in to access my courses
 *
 * Note on the minimum-password-length rule: it is enforced solely via the
 * HTML5 `minLength` attribute on the password input. jsdom does not enforce
 * constraint validation on form submission, so any behavioral test for that
 * rule in this environment is hopelessly contrived — the form actually
 * submits with a short password under jsdom. The previous attribute check
 * was a pure plumbing test and has been removed; coverage for this rule
 * belongs in an end-to-end test running in a real browser.
 */

describe("Feature: Student Login Form", () => {
  describe("Scenario: Student sees the login form", () => {
    it("should display username and password fields with a submit button", () => {
      // Setup & Action
      render(<StudentLoginForm />);

      // Assert - form fields are visible with correct labels
      expect(screen.getByLabelText("Username")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();

      // Assert - submit button is visible
      expect(
        screen.getByRole("button", { name: "Sign In" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Student submits with empty fields", () => {
    it("should not invoke the sign-in action when fields are empty", async () => {
      // Setup
      const user = userEvent.setup();
      vi.mocked(authClient.signIn.email).mockClear();
      render(<StudentLoginForm />);

      // Action — click Sign In without filling any field
      await user.click(screen.getByRole("button", { name: "Sign In" }));

      // Assert — HTML5 validation blocks submission, so signIn is never
      // called and no error banner is shown.
      expect(authClient.signIn.email).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: username is only spaces", () => {
    it("names the username field, not the password, and never calls sign-in", async () => {
      // Setup — a whitespace-only username slips past `required` (only
      // .trim() catches it), with a real password so the failure can only
      // be about the username.
      const user = userEvent.setup();
      vi.mocked(authClient.signIn.email).mockClear();
      render(<StudentLoginForm />);

      // Action
      await user.type(screen.getByLabelText("Username"), "   ");
      await user.type(screen.getByLabelText("Password"), "password123");
      await user.click(screen.getByRole("button", { name: "Sign In" }));

      // Assert — the username field itself carries the error, not a
      // form-level banner naming a field that isn't the problem.
      const usernameInput = screen.getByLabelText("Username");
      expect(usernameInput).toHaveAttribute("aria-invalid", "true");
      const describedById = usernameInput.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      expect(
        document.getElementById(describedById as string),
      ).toHaveTextContent(/username/i);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(authClient.signIn.email).not.toHaveBeenCalled();
    });
  });

  describe("Scenario: password is only spaces", () => {
    it("names the password field, not the username, and never calls sign-in", async () => {
      // Setup — password isn't trimmed on submit, but `minLength={8}` isn't
      // enforced by jsdom, so 8 spaces reaches the handler as "blank".
      const user = userEvent.setup();
      vi.mocked(authClient.signIn.email).mockClear();
      render(<StudentLoginForm />);

      // Action
      await user.type(screen.getByLabelText("Username"), "alice");
      await user.type(screen.getByLabelText("Password"), "        ");
      await user.click(screen.getByRole("button", { name: "Sign In" }));

      // Assert
      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
      const describedById = passwordInput.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      expect(
        document.getElementById(describedById as string),
      ).toHaveTextContent(/password/i);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(authClient.signIn.email).not.toHaveBeenCalled();
    });
  });

  describe("Scenario: both username and password are only spaces", () => {
    it("shows one message naming both fields, attached to the username field", async () => {
      const user = userEvent.setup();
      vi.mocked(authClient.signIn.email).mockClear();
      render(<StudentLoginForm />);

      await user.type(screen.getByLabelText("Username"), "   ");
      await user.type(screen.getByLabelText("Password"), "        ");
      await user.click(screen.getByRole("button", { name: "Sign In" }));

      const usernameInput = screen.getByLabelText("Username");
      expect(usernameInput).toHaveAttribute("aria-invalid", "true");
      const describedById = usernameInput.getAttribute("aria-describedby");
      expect(
        document.getElementById(describedById as string),
      ).toHaveTextContent("Enter your username and password");
      expect(screen.getByLabelText("Password")).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(authClient.signIn.email).not.toHaveBeenCalled();
    });
  });
});
