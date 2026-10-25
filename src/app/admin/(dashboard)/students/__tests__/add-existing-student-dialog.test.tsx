// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { addExistingStudentAction } from "../actions";
import { AddExistingStudentDialog } from "../add-existing-student-dialog";

vi.mock("../actions", () => ({
  addExistingStudentAction: vi.fn(),
}));

describe("Feature: Add existing student dialog", () => {
  it("posts the username with the school it was opened in and shows the refusal", async () => {
    // Given the action refuses the username
    const user = userEvent.setup();
    vi.mocked(addExistingStudentAction).mockResolvedValue({
      success: false,
      message: "No student with that username",
    });
    render(<AddExistingStudentDialog schoolId="school-1" />);
    await user.click(
      screen.getByRole("button", { name: "Add existing student" }),
    );

    // When the admin submits a username
    await user.type(screen.getByLabelText("Username"), "nobody");
    await user.click(screen.getByRole("button", { name: "Add student" }));

    // Then the post carries the opened-in school and the refusal is shown
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No student with that username",
    );
    const posted = vi.mocked(addExistingStudentAction).mock.calls[0][1];
    expect(posted.get("expectedSchoolId")).toBe("school-1");
    expect(posted.get("username")).toBe("nobody");
  });

  it("shows the success message naming the added student", async () => {
    const user = userEvent.setup();
    vi.mocked(addExistingStudentAction).mockResolvedValue({
      success: true,
      message: 'Added "Alice Nguyen" (alice) to your school',
    });
    render(<AddExistingStudentDialog schoolId="school-1" />);
    await user.click(
      screen.getByRole("button", { name: "Add existing student" }),
    );

    await user.type(screen.getByLabelText("Username"), "alice");
    await user.click(screen.getByRole("button", { name: "Add student" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      'Added "Alice Nguyen" (alice) to your school',
    );
  });
});
