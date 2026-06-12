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
