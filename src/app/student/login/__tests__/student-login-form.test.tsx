// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

  describe("Scenario: Form fields have correct input types", () => {
    it("should use password type for the password field", () => {
      // Setup & Action
      render(<StudentLoginForm />);

      // Assert
      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("should require all fields", () => {
      // Setup & Action
      render(<StudentLoginForm />);

      // Assert
      expect(screen.getByLabelText("Username")).toBeRequired();
      expect(screen.getByLabelText("Password")).toBeRequired();
    });

    it("should enforce minimum password length of 8 characters", () => {
      // Setup & Action
      render(<StudentLoginForm />);

      // Assert
      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("minLength", "8");
    });
  });
});
