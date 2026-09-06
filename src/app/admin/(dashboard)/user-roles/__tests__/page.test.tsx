// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Db } from "mongodb";
import { Role } from "src/lib/session";
import {
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserRolesPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  forbidden: vi.fn(),
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
 * Feature: an owner sees everyone who can sign in and their current access
 * As an owner (Tier 2)
 * I want to see every account that can sign in, with its current role
 * So that I know who already has administrator access before granting more
 */
describe("Feature: an owner sees everyone who can sign in and their current access", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;

    mockGetSession.mockResolvedValue({
      role: Role.Admin,
      userId: "owner-1",
      email: "owner@example.com",
    });
    mockIsAdminEmail.mockResolvedValue(true);
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("lists every account by email with its current role, defaulting a roleless account to student", async () => {
    // Given: one recorded admin and one pre-role-model account with no
    // `role` key at all (D21 — must read as student, not crash or admin).
    // Inserted student-then-admin (reverse of alphabetical) so the sort
    // assertion below can't pass by coincidence of insertion order.
    await db.collection("user").insertOne({
      email: "student1@lms.internal",
      name: "Student One",
    });
    await db.collection("user").insertOne({
      email: "admin1@example.com",
      name: "Admin One",
      role: "admin",
    });

    const ui = await UserRolesPage();
    render(ui);

    const rows = screen.getAllByTestId(/^user-role-row-/);
    expect(rows).toHaveLength(2);
    // Alphabetical by email, not insertion order — covers both the sort
    // and that every account (student included) gets a row.
    expect(rows.map((row) => within(row).getByText(/@/).textContent)).toEqual([
      "admin1@example.com",
      "student1@lms.internal",
    ]);

    const adminRow = rows.find((row) =>
      within(row).queryByText("admin1@example.com"),
    );
    expect(adminRow).toBeDefined();
    expect(
      within(adminRow as HTMLElement).getByText("Admin"),
    ).toBeInTheDocument();

    const studentRow = rows.find((row) =>
      within(row).queryByText("student1@lms.internal"),
    );
    expect(studentRow).toBeDefined();
    expect(
      within(studentRow as HTMLElement).getByText("Student"),
    ).toBeInTheDocument();
  });
});
