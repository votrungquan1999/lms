import type { Db } from "mongodb";
import { ensureIndexes } from "src/lib/database";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRequireOwnerSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireOwnerSession: mockRequireOwnerSession,
  })),
}));

import { createSchoolAction } from "../actions";

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  mockRequireOwnerSession.mockResolvedValue({
    userId: "owner-1",
    email: "owner@example.com",
    role: "admin",
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

function schoolForm(name: string, slug: string): FormData {
  const formData = new FormData();
  formData.set("name", name);
  formData.set("slug", slug);
  return formData;
}

/**
 * Feature: the platform owner creates a school
 * As the platform owner
 * I want to create a school by name and a short unique handle
 * So that a new tenant exists for admins and students to belong to
 */
describe("Feature: the platform owner creates a school", () => {
  it("creates the school and it shows up in listSchools", async () => {
    const { schoolService } = getTestServices();

    const state = await createSchoolAction(null, schoolForm("Acme", "acme"));

    expect(state.success).toBe(true);
    const schools = await schoolService.listSchools();
    expect(schools.map((s) => s.slug)).toEqual(["acme"]);
  });

  it("gives nobody a membership on create, not even the owner", async () => {
    await createSchoolAction(null, schoolForm("Acme", "acme"));

    // A raw count covers every user, not just the owner.
    const count = await db.collection("school_membership").countDocuments();
    expect(count).toBe(0);
  });

  it("refuses when the caller is not the owner, and creates nothing", async () => {
    mockRequireOwnerSession.mockRejectedValue(new Error("not owner"));
    const { schoolService } = getTestServices();

    const state = await createSchoolAction(null, schoolForm("Acme", "acme"));

    expect(state.success).toBe(false);
    expect(await schoolService.listSchools()).toHaveLength(0);
  });

  it.each([
    ["uppercase letters", "ACME"],
    ["a space", "acme school"],
    ["diacritics", "trường-a"],
    ["empty", ""],
  ])("refuses a slug with %s, and creates nothing", async (_label, slug) => {
    const { schoolService } = getTestServices();

    const state = await createSchoolAction(null, schoolForm("Acme", slug));

    expect(state.success).toBe(false);
    expect(await schoolService.listSchools()).toHaveLength(0);
  });

  it("refuses a blank name, and creates nothing", async () => {
    const { schoolService } = getTestServices();

    const state = await createSchoolAction(null, schoolForm("   ", "acme"));

    expect(state.success).toBe(false);
    expect(await schoolService.listSchools()).toHaveLength(0);
  });

  it("refuses a duplicate slug with a friendly message, and keeps one school", async () => {
    const { schoolService } = getTestServices();
    await ensureIndexes(db);
    await createSchoolAction(null, schoolForm("Acme", "acme"));

    const state = await createSchoolAction(
      null,
      schoolForm("A Different Name", "acme"),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("A school with that slug already exists");
    expect(await schoolService.listSchools()).toHaveLength(1);
  });

  it("allows two schools with the same name and different slugs", async () => {
    const { schoolService } = getTestServices();

    await createSchoolAction(null, schoolForm("Same Name", "same-name-a"));
    const state = await createSchoolAction(
      null,
      schoolForm("Same Name", "same-name-b"),
    );

    expect(state.success).toBe(true);
    expect(await schoolService.listSchools()).toHaveLength(2);
  });
});
