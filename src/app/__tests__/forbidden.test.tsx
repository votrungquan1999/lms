// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Forbidden from "../forbidden";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("src/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

/**
 * Feature: the 403 page's "Return Home" looks like a real button, matching
 * the "Sign Out" button beside it — a hand-rolled `<Link>` with its own
 * styling used to sit at a different height and corner radius.
 */
describe("Feature: the 403 page's Return Home matches Sign Out", () => {
  it("renders Return Home as a Button the same size as Sign Out", () => {
    render(<Forbidden />);

    const returnHome = screen.getByRole("link", { name: "Return Home" });
    const signOut = screen.getByRole("button", { name: "Sign Out" });

    expect(returnHome).toHaveAttribute("data-slot", "button");
    expect(returnHome).toHaveAttribute(
      "data-size",
      signOut.getAttribute("data-size"),
    );
  });
});
