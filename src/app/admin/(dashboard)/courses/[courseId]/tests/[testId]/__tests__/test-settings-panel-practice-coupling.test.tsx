// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TestSettingsPanel } from "../test-settings-panel";

// The panel imports the server action transitively; stub the singletons so the
// module graph loads under jsdom. The action itself is never invoked here — the
// test only exercises the client-side R10 coupling.
vi.mock("src/lib/services-singleton", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function renderPanel(overrides?: {
  timeLimitMinutes?: number | null;
  isPractice?: boolean;
}) {
  render(
    <TestSettingsPanel
      courseId="course-1"
      testId="test-1"
      showGradeAfterSubmit
      showCorrectAnswerAfterSubmit
      timeLimitMinutes={overrides?.timeLimitMinutes ?? 30}
      isPractice={overrides?.isPractice ?? false}
      gradesReleasedAt={null}
      correctAnswersReleasedAt={null}
    />,
  );
}

describe("Feature: Test Settings Panel — R10 practice/time-limit coupling", () => {
  it("disables the time-limit input when the admin checks Practice test (so the forbidden combo can't be submitted)", async () => {
    const user = userEvent.setup();
    renderPanel({ timeLimitMinutes: 30, isPractice: false });

    const timeLimit = screen.getByLabelText(/time limit/i);
    expect(timeLimit).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: /practice test/i }));

    expect(timeLimit).toBeDisabled();
  });
});
