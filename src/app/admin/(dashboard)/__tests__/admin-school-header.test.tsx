// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import { AdminSchoolHeader } from "../admin-school-header";
import { LeaveGuardProvider, useLeaveGuard } from "../leave-guard.state";

const { switchSchoolAction } = vi.hoisted(() => ({
  switchSchoolAction: vi.fn(),
}));
vi.mock("../switch-school-actions", () => ({ switchSchoolAction }));

function UnsavedWork() {
  const { setHasWork } = useLeaveGuard();
  useEffect(() => setHasWork(true), [setHasWork]);
  return null;
}

const alpha = { id: "alpha", name: "Alpha School" };
const beta = { id: "beta", name: "Beta School" };

describe("Feature: switching school asks first when work is unsaved", () => {
  it("switches only after the teacher confirms Leave", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SidebarProvider>
          <LeaveGuardProvider>
            <UnsavedWork />
            <AdminSchoolHeader school={alpha} schools={[alpha, beta]} />
          </LeaveGuardProvider>
        </SidebarProvider>
      </TooltipProvider>,
    );

    // When the teacher picks the other school while work is on screen
    await user.click(screen.getByTestId("school-switcher-trigger"));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Beta School" }),
    );

    // Then the leave question shows and nothing has switched yet
    await screen.findByRole("alertdialog", { name: "Leave this page?" });
    expect(switchSchoolAction).not.toHaveBeenCalled();

    // When they confirm
    await user.click(screen.getByRole("button", { name: "Leave" }));

    // Then the switch runs for the chosen school
    await vi.waitFor(() => expect(switchSchoolAction).toHaveBeenCalledOnce());
    expect(switchSchoolAction.mock.calls[0][0].get("schoolId")).toBe("beta");
  });
});
