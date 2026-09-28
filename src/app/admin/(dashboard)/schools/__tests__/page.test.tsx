// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Role } from "src/lib/session";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SchoolsPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockGetSession = vi.fn();
const mockIsAdminEmail = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    getSession: mockGetSession,
    isAdminEmail: mockIsAdminEmail,
  })),
}));

/**
 * Feature: the schools console is owner-only
 * As the LMS system
 * I want the schools console to demand the same Tier-2 owner check as
 * user-roles
 * So that a recorded admin who isn't the owner can never reach it, even
 * before any school exists to grant them into
 */
describe("Feature: the schools console is owner-only", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("forbids a recorded admin who is not the owner", async () => {
    mockGetSession.mockResolvedValue({
      role: Role.Admin,
      userId: "admin-1",
      email: "not-owner@example.com",
    });
    mockIsAdminEmail.mockResolvedValue(false);

    await expect(SchoolsPage()).rejects.toThrow("forbidden called");
  });

  it("renders the list for the owner, even before any school exists", async () => {
    mockGetSession.mockResolvedValue({
      role: Role.Admin,
      userId: "owner-1",
      email: "owner@example.com",
    });
    mockIsAdminEmail.mockResolvedValue(true);

    const ui = await SchoolsPage();
    render(ui);

    expect(screen.getByText("Schools")).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^school-row-/)).toHaveLength(0);
  });

  it("links each school row to its detail page", async () => {
    mockGetSession.mockResolvedValue({
      role: Role.Admin,
      userId: "owner-1",
      email: "owner@example.com",
    });
    mockIsAdminEmail.mockResolvedValue(true);
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });

    const ui = await SchoolsPage();
    render(ui);

    const link = screen.getByRole("link", { name: /Acme/ });
    expect(link.getAttribute("href")).toBe(`/admin/schools/${school.id}`);
  });
});
