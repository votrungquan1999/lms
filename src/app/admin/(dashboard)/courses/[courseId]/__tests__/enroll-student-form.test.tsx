// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setEnrollmentsAction } from "../actions";
import { ManageEnrollmentsDialog } from "../enroll-student-form";

vi.mock("../actions", () => ({
  setEnrollmentsAction: vi.fn(),
}));

/**
 * Regression guard (F4): the dialog's BUG-2 fix depends entirely on the
 * hidden `observedStudentIds` inputs actually being submitted. "Absent" and
 * "empty" look identical to `setEnrolledStudents` (both mean "nothing was
 * observed"), so a refactor that silently drops these inputs would make
 * unenrolling anyone impossible with no error — nothing else catches that.
 */
describe("Feature: Manage Enrollments Dialog — observed snapshot", () => {
  it("renders one hidden observedStudentIds input per currently enrolled student", async () => {
    const user = userEvent.setup();
    vi.mocked(setEnrollmentsAction).mockResolvedValue({
      success: true,
      message: "",
    });

    render(
      <ManageEnrollmentsDialog
        courseId="course-1"
        students={[
          { id: "s1", username: "alice", name: "Alice" },
          { id: "s2", username: "bob", name: "Bob" },
        ]}
        enrolledStudentIds={["s1", "s2"]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Manage Enrollments" }),
    );

    const observedInputs = document.querySelectorAll<HTMLInputElement>(
      'input[type="hidden"][name="observedStudentIds"]',
    );

    expect(Array.from(observedInputs, (input) => input.value)).toEqual([
      "s1",
      "s2",
    ]);
  });
});
