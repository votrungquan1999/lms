// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteTestButton } from "../delete-test-button";

const mockRequireAdminSession = vi.fn();
const mockDeleteTest = vi.fn();

vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireAdminSession: (...args: unknown[]) =>
      mockRequireAdminSession(...args),
  }),
}));

vi.mock("src/lib/services-singleton", () => ({
  getTestService: vi.fn().mockResolvedValue({
    deleteTest: (...args: unknown[]) => mockDeleteTest(...args),
  }),
  getQuestionService: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

/**
 * Feature: Delete Test Button
 * As an admin
 * I want to be able to delete a test
 * So that I can remove tests that are no longer needed
 */

describe("Feature: Delete Test Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Scenario: Admin sees the delete button", () => {
    it("should display a delete button", () => {
      render(<DeleteTestButton testId="test-1" courseId="course-1" />);

      expect(
        screen.getByRole("button", { name: /delete test/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin clicks delete without confirming", () => {
    it("should show a confirmation dialog", async () => {
      const user = userEvent.setup();
      render(<DeleteTestButton testId="test-1" courseId="course-1" />);

      const deleteBtn = screen.getByRole("button", { name: /delete test/i });
      await user.click(deleteBtn);

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/Are you absolutely sure/i)).toBeInTheDocument();
      expect(mockDeleteTest).not.toHaveBeenCalled();
    });
  });

  describe("Scenario: Admin confirms deletion", () => {
    it("should call deleteTest and revalidate", async () => {
      const user = userEvent.setup();

      mockRequireAdminSession.mockResolvedValue({ userId: "admin1" });
      mockDeleteTest.mockResolvedValue(undefined);

      render(<DeleteTestButton testId="test-1" courseId="course-1" />);

      const deleteBtn = screen.getByRole("button", { name: /delete test/i });
      await user.click(deleteBtn);

      const confirmBtn = screen.getByRole("button", { name: /continue/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(mockDeleteTest).toHaveBeenCalledTimes(1);
      });

      expect(mockDeleteTest).toHaveBeenCalledWith("test-1", "admin1");
    });
  });
});
