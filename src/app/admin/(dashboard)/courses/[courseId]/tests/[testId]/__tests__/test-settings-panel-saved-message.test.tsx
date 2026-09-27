// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SetTestSettingsState } from "../settings-actions";
import { TestSettingsPanel } from "../test-settings-panel";

const mockSetTestSettingsAction = vi.fn();

// A controllable deferred promise, not the real DB action: the race this
// step closes is a client-only timing gap, and a real save resolves too
// fast to reliably land a click inside its pending window (mirrors
// submit-without-reset.test.tsx's own deferred-promise pattern).
vi.mock("../settings-actions", () => ({
  setTestSettingsAction: (...args: unknown[]) =>
    mockSetTestSettingsAction(...args),
}));

function renderPanel() {
  render(
    <TestSettingsPanel
      courseId="course-1"
      testId="test-1"
      showGradeAfterSubmit={false}
      showCorrectAnswerAfterSubmit={false}
      timeLimitMinutes={null}
      isPractice={false}
      answerRevealMode="diff"
      gradesReleasedAt={null}
      correctAnswersReleasedAt={null}
    />,
  );
}

describe("Feature: Test Settings Panel — saved confirmation during a pending save", () => {
  it("hides the saved confirmation when a control changes while that save is still pending", async () => {
    const user = userEvent.setup();
    let resolveSave: (state: SetTestSettingsState) => void = () => {};
    mockSetTestSettingsAction.mockImplementation(
      () =>
        new Promise<SetTestSettingsState>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderPanel();

    await user.click(screen.getByRole("button", { name: /save settings/i }));

    // While that save is still in flight, the admin changes another control.
    await user.click(
      screen.getByRole("checkbox", { name: /show grade after submit/i }),
    );

    resolveSave({ success: true, message: "Settings saved" });

    // The save resolves successfully, but the form no longer matches what
    // it saved — the confirmation must never appear for this submit.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /save settings/i }),
      ).toBeEnabled();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not bring back an earlier save's confirmation while saving changed values", async () => {
    const user = userEvent.setup();
    const resolvers: ((state: SetTestSettingsState) => void)[] = [];
    mockSetTestSettingsAction.mockImplementation(
      () =>
        new Promise<SetTestSettingsState>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    renderPanel();

    // A first save goes through and confirms.
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    resolvers[0]({ success: true, message: "Settings saved" });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Settings saved",
    );

    // The admin changes a control and saves again; that save is in flight.
    await user.click(
      screen.getByRole("checkbox", { name: /show grade after submit/i }),
    );
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();

    // The first save's confirmation doesn't describe these values yet.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolvers[1]({ success: false, message: "Database unavailable" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
