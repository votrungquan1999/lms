// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createPoolAction } from "../actions";
import { CreatePoolDialog } from "../create-pool-form";

vi.mock("../actions", () => ({
  createPoolAction: vi.fn(),
}));

/**
 * Feature: Pool Creation Dialog
 * As an admin
 * I want a dialog to create question pools
 * So that I can author reusable questions for any test.
 */

describe("Feature: Pool Creation Dialog", () => {
  describe("Scenario: Admin successfully creates a pool", () => {
    it("should show a success message after submitting with a name", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockResolvedValue({
        success: true,
        message: 'Pool "Algebra basics" created successfully',
      });
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      await user.type(screen.getByLabelText("Pool Name"), "Algebra basics");
      await user.click(screen.getByRole("button", { name: "Create Pool" }));

      expect(
        await screen.findByText('Pool "Algebra basics" created successfully'),
      ).toBeInTheDocument();
    });
  });

  describe("Scenario: Admin's refused submit keeps what they typed", () => {
    it("keeps the typed name after a refused submit", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockResolvedValue({
        success: false,
        message: "Unauthorized: admin access required",
      });
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      await user.type(screen.getByLabelText("Pool Name"), "Algebra basics");
      await user.click(screen.getByRole("button", { name: "Create Pool" }));
      await screen.findByText("Unauthorized: admin access required");

      expect(screen.getByLabelText("Pool Name")).toHaveValue("Algebra basics");
    });
  });

  describe("Scenario: The server refuses the name itself", () => {
    it("marks the name field invalid and names the problem next to it", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockResolvedValue({
        success: false,
        message: "Pool name is required",
        fieldErrors: { name: "Pool name is required" },
      });
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      await user.type(screen.getByLabelText("Pool Name"), "   ");
      await user.click(screen.getByRole("button", { name: "Create Pool" }));

      const nameInput = await screen.findByLabelText("Pool Name");
      expect(nameInput).toHaveAttribute("aria-invalid", "true");
      expect(nameInput).toHaveAccessibleDescription("Pool name is required");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("Scenario: A successful create leaves a clean form", () => {
    it("clears the name field after a successful create", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockResolvedValue({
        success: true,
        message: 'Pool "Algebra basics" created successfully',
      });
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      await user.type(screen.getByLabelText("Pool Name"), "Algebra basics");
      await user.click(screen.getByRole("button", { name: "Create Pool" }));
      await screen.findByText('Pool "Algebra basics" created successfully');

      expect(screen.getByLabelText("Pool Name")).toHaveValue("");
    });
  });

  describe("Scenario: Closing and reopening the dialog abandons the last attempt", () => {
    it("shows a fresh form with no stale success banner after reopening", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockResolvedValue({
        success: true,
        message: 'Pool "Algebra basics" created successfully',
      });
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));
      await user.type(screen.getByLabelText("Pool Name"), "Algebra basics");
      await user.click(screen.getByRole("button", { name: "Create Pool" }));
      await screen.findByText('Pool "Algebra basics" created successfully');
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      expect(
        screen.queryByText('Pool "Algebra basics" created successfully'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Scenario: Admin submits without filling the name", () => {
    it("should not invoke the create action when the name is empty", async () => {
      const user = userEvent.setup();
      vi.mocked(createPoolAction).mockClear();
      render(<CreatePoolDialog />);
      await user.click(screen.getByRole("button", { name: "Add Pool" }));

      await user.click(screen.getByRole("button", { name: "Create Pool" }));

      expect(createPoolAction).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
