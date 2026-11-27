// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ai-grade-actions", () => ({
  regenerateSubmissionAction: vi.fn(),
}));

import { RegenerateWithAiDialog } from "../regenerate-with-ai-dialog";

const dialogWith = (disabled = false) => (
  <RegenerateWithAiDialog
    testId="test-1"
    courseId="course-1"
    studentId="stu-1"
    open
    onOpenChange={() => {}}
    disabled={disabled}
  />
);

describe("Feature: the Regenerate all dialog asks for a reason", () => {
  it("shows a reason textarea and a submit button", async () => {
    render(dialogWith());

    const reasonField = await screen.findByLabelText(/reason/i);
    expect(reasonField.tagName).toBe("TEXTAREA");
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /regenerate all/i,
      }),
    ).toHaveAttribute("type", "submit");
  });
});

describe("Feature: Regenerate all can include questions the teacher already graded", () => {
  it("starts unticked and submits includeGraded=on only once the teacher ticks it, with a note saying what each setting does", async () => {
    render(dialogWith());
    const user = userEvent.setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Also regenerate questions I've already graded",
    });
    const form = checkbox.closest("form") as HTMLFormElement;

    // Unticked by default: the form sends nothing for it.
    expect(checkbox).not.toBeChecked();
    expect(new FormData(form).get("includeGraded")).toBeNull();
    expect(screen.getByText(/^Off:/)).toBeInTheDocument();

    // Ticked: the form sends "on", which the action reads.
    await user.click(checkbox);
    expect(new FormData(form).get("includeGraded")).toBe("on");
    expect(screen.getByText(/^On:/)).toBeInTheDocument();
  });
});

describe("Feature: a Regenerate all dialog left open cannot submit once AI grading is pending", () => {
  it("disables the open dialog's submit button when the page learns a job is pending", async () => {
    const { rerender } = render(dialogWith(false));
    expect(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /regenerate all/i,
      }),
    ).toBeEnabled();

    rerender(dialogWith(true));

    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /regenerate all/i,
      }),
    ).toBeDisabled();
  });
});
