// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShareInviteLink } from "../share-invite-link";

vi.mock("../actions", () => ({
  getInviteLinkAction: vi.fn(),
  regenerateInviteLinkAction: vi.fn(),
  disableInviteLinkAction: vi.fn(),
}));

/**
 * Regression guard: this ternary is the ONLY thing deciding whether an admin
 * ever sees a link. Every action-level test mocks the actions and never
 * renders the component, so an inverted condition (or broken prop wiring)
 * would leave the admin clicking "Get join link" forever with no error and
 * no test catching it.
 */
describe("Feature: an admin gets a shareable join link for a course", () => {
  it("shows only the Get join link control when no token exists yet", () => {
    render(<ShareInviteLink courseId="course-1" inviteToken={null} />);

    expect(
      screen.getByRole("button", { name: "Get join link" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Regenerate link" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn off link" })).toBeNull();
  });

  it("shows the join path in a code element, Copy, Regenerate link, Turn off link and the helper text once a token exists", () => {
    render(<ShareInviteLink courseId="course-1" inviteToken="abc-123" />);

    expect(screen.getByText("/join/abc-123").tagName).toBe("CODE");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn off link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Anyone with this link can ask to join; you approve each request above. Regenerating makes the old link stop working. Turning it off keeps everyone already in the course.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get join link" })).toBeNull();
  });
});
