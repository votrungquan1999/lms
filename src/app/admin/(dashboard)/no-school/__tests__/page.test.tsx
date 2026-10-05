// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { AdminSession } from "src/lib/session";
import {
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NoSchoolPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));

// The page's own owner check goes through auth-singleton, like the layout's.
const ownerEmails = vi.hoisted(() => new Set<string>());
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    isAdminEmail: vi.fn(async (email: string) => ownerEmails.has(email)),
  })),
}));

beforeEach(async () => {
  ownerEmails.clear();
  await setupTestDb();
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: the no-school page tells a school-less admin what happened
 * As a staff account with no school membership
 * I want a page that explains I'm not part of any school yet
 * So that I'm not stuck on a broken screen or looped back to myself
 */
describe("Feature: the no-school page tells a school-less admin what happened", () => {
  it("renders for a school-less admin, without redirecting to itself", async () => {
    signInAs(
      new AdminSession({
        userId: "admin-1",
        email: "admin@example.com",
        school: null,
      }),
    );

    const ui = await NoSchoolPage();
    render(ui);

    expect(
      screen.getByText(/aren't part of any school yet/i),
    ).toBeInTheDocument();
  });

  it("links the platform owner to the schools console", async () => {
    ownerEmails.add("owner@example.com");
    signInAs(
      new AdminSession({
        userId: "owner-1",
        email: "owner@example.com",
        school: null,
      }),
    );

    render(await NoSchoolPage());

    expect(screen.getByRole("link", { name: /schools/i })).toHaveAttribute(
      "href",
      "/admin/schools",
    );
  });

  it("shows another school-less admin no link to the schools console", async () => {
    signInAs(
      new AdminSession({
        userId: "admin-1",
        email: "admin@example.com",
        school: null,
      }),
    );

    render(await NoSchoolPage());

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
