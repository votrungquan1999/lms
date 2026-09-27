// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SetTestSettingsState } from "../settings-actions";
import { TestSettingsPanel } from "../test-settings-panel";

const mockSetTestSettingsAction = vi.fn();

// Same controllable-promise approach as test-settings-panel-saved-message.test.tsx —
// lets the test resolve the save and then apply the post-save prop refresh itself.
vi.mock("../settings-actions", () => ({
  setTestSettingsAction: (...args: unknown[]) =>
    mockSetTestSettingsAction(...args),
}));

function renderPanel(
  props: Partial<React.ComponentProps<typeof TestSettingsPanel>> = {},
) {
  return render(
    <TestSettingsPanel
      courseId="course-1"
      testId="test-1"
      showGradeAfterSubmit={false}
      showCorrectAnswerAfterSubmit={false}
      timeLimitMinutes={30}
      isPractice={false}
      answerRevealMode="diff"
      gradesReleasedAt={null}
      correctAnswersReleasedAt={null}
      {...props}
    />,
  );
}

describe("Feature: Test Settings Panel — time-limit box after a Practice save", () => {
  it("no longer shows the pre-save time limit once Practice is unticked again", async () => {
    const user = userEvent.setup();
    mockSetTestSettingsAction.mockResolvedValue({
      success: true,
      message: "Settings saved",
    } satisfies SetTestSettingsState);
    const { rerender } = renderPanel({ timeLimitMinutes: 30 });

    await user.click(screen.getByRole("checkbox", { name: /practice test/i }));
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Settings saved",
    );

    // Mirrors the post-save server revalidation: the same instance receives
    // fresh props with the time limit the save actually cleared.
    rerender(
      <TestSettingsPanel
        courseId="course-1"
        testId="test-1"
        showGradeAfterSubmit={false}
        showCorrectAnswerAfterSubmit={false}
        timeLimitMinutes={null}
        isPractice={true}
        answerRevealMode="diff"
        gradesReleasedAt={null}
        correctAnswersReleasedAt={null}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /practice test/i }));

    const timeLimit = screen.getByLabelText(/time limit/i) as HTMLInputElement;
    expect(timeLimit).toBeEnabled();
    expect(timeLimit.value).toBe("");
  });

  it("keeps a typed time limit on screen when the save is refused", async () => {
    const user = userEvent.setup();
    mockSetTestSettingsAction.mockResolvedValue({
      success: false,
      message: "Database unavailable",
    } satisfies SetTestSettingsState);
    renderPanel({ timeLimitMinutes: 30 });

    const timeLimit = screen.getByLabelText(/time limit/i) as HTMLInputElement;
    await user.clear(timeLimit);
    await user.type(timeLimit, "45");
    await user.click(screen.getByRole("button", { name: /save settings/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );

    // The saved value never changed, so the box keeps what was typed.
    expect(
      (screen.getByLabelText(/time limit/i) as HTMLInputElement).value,
    ).toBe("45");
  });
});
