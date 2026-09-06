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
 * would leave the admin clicking "Get Join Link" forever with no error and
 * no test catching it.
 */
describe("Feature: an admin gets a shareable join link for a course", () => {
  it("shows only the Get Join Link control when no token exists yet", () => {
    render(<ShareInviteLink courseId="course-1" inviteToken={null} />);

    expect(
      screen.getByRole("button", { name: "Get Join Link" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Regenerate Link" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Turn Off Link" })).toBeNull();
  });

  it("shows the join path and both management controls once a token exists", () => {
    render(<ShareInviteLink courseId="course-1" inviteToken="abc-123" />);

    expect(screen.getByText("/join/abc-123")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Regenerate Link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn Off Link" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Join Link" })).toBeNull();
  });
});
