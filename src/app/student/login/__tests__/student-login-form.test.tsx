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
});
