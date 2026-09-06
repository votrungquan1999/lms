// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { LoginEntryState } from "src/lib/auth-service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLoginPage from "../page";

/**
 * Regression guard for BUG-4's routing wiring (D39 tested only the resolver;
 * nothing proved the login page actually routes on its output). Mirrors the
 * mocking harness in src/lib/__tests__/page-guard.test.ts.
 */

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("REDIRECT");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const mockResolveLoginEntryState = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: () =>
    Promise.resolve({
      resolveLoginEntryState: mockResolveLoginEntryState,
    }),
}));

vi.mock("src/lib/auth-client", () => ({
  authClient: {
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockHeaders.mockResolvedValue(new Headers());
});

describe("AdminLoginPage", () => {
  it("redirects to /admin/dashboard when the caller is already an admin", async () => {
    mockResolveLoginEntryState.mockResolvedValue(LoginEntryState.Admin);

    await expect(AdminLoginPage()).rejects.toThrow("REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("shows Account Not Set Up with a Sign Out button and no Google button when unclassified", async () => {
    mockResolveLoginEntryState.mockResolvedValue(LoginEntryState.Unclassified);

    const ui = await AdminLoginPage();
    render(ui);

    expect(screen.getByText("Account Not Set Up")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign Out" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign in with google/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the Google sign-in button when signed out", async () => {
    mockResolveLoginEntryState.mockResolvedValue(LoginEntryState.SignedOut);

    const ui = await AdminLoginPage();
    render(ui);

    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeInTheDocument();
  });
});
