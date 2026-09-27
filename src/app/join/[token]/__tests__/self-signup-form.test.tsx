// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { joinSignupAction } from "../actions";
import { SelfSignupForm } from "../self-signup-form";

vi.mock("../actions", () => ({
  joinSignupAction: vi.fn(),
}));

/**
 * Feature: a refused self-signup keeps what the visitor typed
 * As a prospective student whose account creation was refused
 * I want my name, username and password to still be on screen
 * So that I don't have to retype everything for an unrelated refusal
 */
describe("Feature: a refused self-signup keeps what was typed", () => {
  it("keeps name, username and password, password included, after a refused submit", async () => {
    const user = userEvent.setup();
    vi.mocked(joinSignupAction).mockResolvedValue({
      success: false,
      message:
        "This username already belongs to an account. Please sign in with your original method instead.",
    });

    render(<SelfSignupForm token="tok-1" />);

    await user.type(screen.getByLabelText("Full Name"), "Alice Smith");
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "hunter2pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("alert");

    // Read right after the refusal — retyping into a stale value would
    // append rather than replace, masking a real reset.
    expect(screen.getByLabelText("Full Name")).toHaveValue("Alice Smith");
    expect(screen.getByLabelText("Username")).toHaveValue("alice");
    expect(screen.getByLabelText("Password")).toHaveValue("hunter2pass");
  });
});

/**
 * Feature: a sign-up refused because the invite died mid-form is not a dead
 * end — it offers the same recovery links as the invalid-invite card.
 */
describe("Feature: a sign-up refused because the invite died mid-form offers a way forward", () => {
  it("offers 'Student sign in' and 'Home' links, like the invalid-invite card", async () => {
    const user = userEvent.setup();
    vi.mocked(joinSignupAction).mockResolvedValue({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });

    render(<SelfSignupForm token="tok-1" />);

    await user.type(screen.getByLabelText("Full Name"), "Alice Smith");
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "hunter2pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
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
    vi.mocked(joinSignupAction).mockResolvedValue({
      success: false,
      message:
        "This username already belongs to an account. Please sign in with your original method instead.",
    });

    render(<SelfSignupForm token="tok-1" />);

    await user.type(screen.getByLabelText("Full Name"), "Alice Smith");
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "hunter2pass");
    await user.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByRole("alert");

    expect(
      screen.queryByRole("link", { name: "Student sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Home" }),
    ).not.toBeInTheDocument();
  });
});
