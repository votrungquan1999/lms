// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { googleUsernameSignupAction } from "../actions";
import { GoogleUsernameForm } from "../google-username-form";

vi.mock("../actions", () => ({
  googleUsernameSignupAction: vi.fn(),
}));

/**
 * Feature: a refused Google-username submit keeps what was typed
 * As a Google signup whose derived username was refused
 * I want the username I typed to stay on screen
 * So that a refusal doesn't silently revert me to the same value that was
 * just refused — the pre-fix bug: the field reverts to `suggestedUsername`,
 * which can be the exact value just refused.
 */
describe("Feature: a refused Google-username submit keeps what was typed", () => {
  it("keeps the typed username instead of reverting to the suggested one", async () => {
    const user = userEvent.setup();
    vi.mocked(googleUsernameSignupAction).mockResolvedValue({
      success: false,
      message: "That username is already taken. Please choose another.",
    });

    render(
      <GoogleUsernameForm token="tok-1" suggestedUsername="alice.smith" />,
    );

    const usernameInput = screen.getByLabelText("Username");
    await user.clear(usernameInput);
    await user.type(usernameInput, "alice.smith2");
    await user.click(screen.getByRole("button", { name: "Finish joining" }));
    await screen.findByRole("alert");

    // Read right after the refusal — retyping into a stale value would
    // append rather than replace, masking a real reset.
    expect(screen.getByLabelText("Username")).toHaveValue("alice.smith2");
  });
});

/**
 * Feature: a Google signup whose invite died mid-form is not a dead end —
 * it offers the same recovery links as the invalid-invite card.
 */
describe("Feature: a Google-username submit refused because the invite died mid-form offers a way forward", () => {
  it("offers 'Student sign in' and 'Home' links, like the invalid-invite card", async () => {
    const user = userEvent.setup();
    vi.mocked(googleUsernameSignupAction).mockResolvedValue({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });

    render(
      <GoogleUsernameForm token="tok-1" suggestedUsername="alice.smith" />,
    );

    await user.click(screen.getByRole("button", { name: "Finish joining" }));
    await screen.findByRole("alert");

    expect(
      screen.getByRole("link", { name: "Student sign in" }),
    ).toHaveAttribute("href", "/student/login");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("offers no recovery links when the refusal is about the username, not the invite", async () => {
    const user = userEvent.setup();
    vi.mocked(googleUsernameSignupAction).mockResolvedValue({
      success: false,
      message: "That username is already taken. Please choose another.",
    });

    render(
      <GoogleUsernameForm token="tok-1" suggestedUsername="alice.smith" />,
    );

    await user.click(screen.getByRole("button", { name: "Finish joining" }));
    await screen.findByRole("alert");

    expect(
      screen.queryByRole("link", { name: "Student sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Home" }),
    ).not.toBeInTheDocument();
  });
});
