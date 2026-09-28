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

beforeEach(async () => {
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
});
