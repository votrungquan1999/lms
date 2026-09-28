// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Db } from "mongodb";
import { AdminSession } from "src/lib/session";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SchoolDetailBreadcrumb from "../../@breadcrumb/schools/[schoolId]/page";
import SchoolDetailPage from "../[schoolId]/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
  notFound: vi.fn(() => {
    throw new Error("not found called");
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

function signInAsOwner(isAdminEmail: boolean) {
  signInAs(
    new AdminSession({
      userId: "owner-1",
      email: "owner@example.com",
      school: null,
    }),
    { isAdminEmail },
  );
}

/**
 * Feature: the owner sees one school's admins
 * As the platform owner
 * I want to open a school and see who already administers it
 * So that I know who to add to or remove from it
 */
describe("Feature: the owner sees one school's admins", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;
    signInAsOwner(true);
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("forbids a recorded admin who is not the owner", async () => {
    signInAsOwner(false);
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });

    await expect(
      SchoolDetailPage({ params: Promise.resolve({ schoolId: school.id }) }),
    ).rejects.toThrow("forbidden called");
  });

  it("calls notFound() for a school id that doesn't exist", async () => {
    await expect(
      SchoolDetailPage({ params: Promise.resolve({ schoolId: "missing" }) }),
    ).rejects.toThrow("not found called");
  });

  it("lists only accounts with a membership as this school's admins", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const memberInsert = await db.collection("user").insertOne({
      email: "member@example.com",
      name: "Member",
      role: "admin",
    });
    await db
      .collection("user")
      .insertOne({ email: "non-member@example.com", name: "Non Member" });
    await schoolService.addMembership(
      school.id,
      memberInsert.insertedId.toString(),
      "owner-1",
    );

    const ui = await SchoolDetailPage({
      params: Promise.resolve({ schoolId: school.id }),
    });
    render(ui);

    const rows = screen.getAllByTestId(/^school-admin-row-/);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("member@example.com")).toBeInTheDocument();
    // The non-member is offered as a candidate to add, never rendered as
    // an existing admin row.
    expect(
      screen.getByRole("option", { name: "non-member@example.com" }),
    ).toBeInTheDocument();
  });

  it("offers only the first 100 accounts to pick from, and says how many exist", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    await db.collection("user").insertMany(
      Array.from({ length: 101 }, (_, index) => ({
        email: `teacher-${String(index).padStart(3, "0")}@example.com`,
        name: `Teacher ${index}`,
      })),
    );

    render(
      await SchoolDetailPage({
        params: Promise.resolve({ schoolId: school.id }),
      }),
    );

    expect(screen.getAllByRole("option")).toHaveLength(100);
    expect(
      screen.queryByRole("option", { name: "teacher-100@example.com" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing first 100 of 101 accounts."),
    ).toBeInTheDocument();
  });

  it("still lists an admin whose account isn't among the first 100", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    // Fills the picker's 100-account cap with names that sort before the
    // admin below, so the admin's own account falls outside it.
    await db.collection("user").insertMany(
      Array.from({ length: 100 }, (_, index) => ({
        email: `teacher-${String(index).padStart(3, "0")}@example.com`,
        name: `Teacher ${index}`,
      })),
    );
    const memberInsert = await db.collection("user").insertOne({
      email: "zzz-outside-the-cap@example.com",
      name: "Outside The Cap",
      role: "admin",
    });
    const userId = memberInsert.insertedId.toString();
    await schoolService.addMembership(school.id, userId, "owner-1");

    const ui = await SchoolDetailPage({
      params: Promise.resolve({ schoolId: school.id }),
    });
    render(ui);

    const row = screen.getByTestId(`school-admin-row-${userId}`);
    expect(
      within(row).getByText("zzz-outside-the-cap@example.com"),
    ).toBeInTheDocument();
  });

  it("forbids a non-owner admin the breadcrumb too, so the school's name never shows", async () => {
    signInAsOwner(false);
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });

    await expect(
      SchoolDetailBreadcrumb({
        params: Promise.resolve({ schoolId: school.id }),
      }),
    ).rejects.toThrow("forbidden called");
  });

  it("shows the owner the school's name in the breadcrumb", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });

    const ui = await SchoolDetailBreadcrumb({
      params: Promise.resolve({ schoolId: school.id }),
    });
    render(ui);

    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
