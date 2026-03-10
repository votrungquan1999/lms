// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateStudentForm } from "../create-student-form";

// Mock the server action module — server actions can't execute in jsdom
vi.mock("../actions", () => ({
  createStudentAction: vi.fn(),
}));

/**
 * Feature: Student Account Creation Form
 * As an admin
 * I want a form to create student accounts
 * So that I can set up credentials for new students
 */

describe("Feature: Student Account Creation Form", () => {
  describe("Scenario: Admin sees the student creation form", () => {
    it("should display name, username, and password fields with a submit button", () => {
      // Setup & Action
      render(<CreateStudentForm />);

      // Assert - form fields are visible with correct labels
      expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
      expect(screen.getByLabelText("Username")).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();

      // Assert - submit button is visible
      expect(
        screen.getByRole("button", { name: "Create Student" }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Form fields have correct input types", () => {
    it("should use password type for the password field", () => {
      // Setup & Action
      render(<CreateStudentForm />);

      // Assert
      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("should require all fields", () => {
      // Setup & Action
      render(<CreateStudentForm />);

      // Assert
      expect(screen.getByLabelText("Full Name")).toBeRequired();
      expect(screen.getByLabelText("Username")).toBeRequired();
      expect(screen.getByLabelText("Password")).toBeRequired();
    });

    it("should enforce minimum password length of 8 characters", () => {
      // Setup & Action
      render(<CreateStudentForm />);

      // Assert
      const passwordInput = screen.getByLabelText("Password");
      expect(passwordInput).toHaveAttribute("minLength", "8");
    });
  });
});
