// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { requestToJoinAction } from "../actions";
import { RequestToJoinForm } from "../request-to-join-form";

vi.mock("../actions", () => ({
  requestToJoinAction: vi.fn(),
}));

/**
 * Feature: a signed-in student who asks to join is told the request was sent
 * and can go straight to their courses
 */
describe("Feature: a sent join request confirms and offers Go to my courses", () => {
  it("replaces the form with Request sent and a link to the student home", async () => {
    const user = userEvent.setup();
    vi.mocked(requestToJoinAction).mockResolvedValue({
      success: true,
      message:
        'Your request to join "Python Basics A1" is now waiting for your teacher to approve.',
    });

    render(
      <RequestToJoinForm
        token="tok-1"
        courseTitle="Python Basics A1"
        name="Olive Lee"
        username="olive"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Request to join" }));

    expect(
      await screen.findByRole("heading", { name: "Request sent" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/waiting for your teacher/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to my courses" }),
    ).toHaveAttribute("href", "/student/dashboard");
    expect(screen.queryByRole("button")).toBeNull();
    const [, formData] = vi.mocked(requestToJoinAction).mock.calls[0];
    expect(formData.get("token")).toBe("tok-1");
  });

  it("keeps the form and shows the reason when the request is refused", async () => {
    const user = userEvent.setup();
    vi.mocked(requestToJoinAction).mockResolvedValue({
      success: false,
      message: "This invitation is no longer valid.",
    });

    render(
      <RequestToJoinForm
        token="tok-1"
        courseTitle="Python Basics A1"
        name="Olive Lee"
        username="olive"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Request to join" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This invitation is no longer valid.",
    );
    expect(screen.queryByRole("heading", { name: "Request sent" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Request to join" }),
    ).toBeInTheDocument();
  });
});
