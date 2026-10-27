// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  LeaveGuardProvider,
  useLeaveGuard,
} from "src/app/admin/(dashboard)/leave-guard.state";
import { describe, expect, it, vi } from "vitest";

/**
 * A page that registers unsaved work without its own message, plus a way out.
 * @param onLeave - What leaving does once confirmed.
 */
function PageWithWork({ onLeave }: { onLeave: () => void }) {
  const { setHasWork, requestLeave } = useLeaveGuard();
  useEffect(() => {
    setHasWork(true);
  }, [setHasWork]);
  return (
    <button type="button" onClick={() => requestLeave(onLeave)}>
      Go elsewhere
    </button>
  );
}

describe("Feature: admin leave guard — any admin page can ask before leaving", () => {
  it("shows a generic unsaved-changes message when the page gives none", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    render(
      <LeaveGuardProvider>
        <PageWithWork onLeave={onLeave} />
      </LeaveGuardProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Go elsewhere" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: "Leave this page?",
    });
    expect(dialog).toHaveTextContent(
      "You have unsaved changes on this page. Leaving now discards them.",
    );
    expect(dialog).not.toHaveTextContent(/questions/i);
    expect(onLeave).not.toHaveBeenCalled();
  });
});
