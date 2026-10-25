import type { Db } from "mongodb";
import { STUDENT_ACCOUNT_CANNOT_BE_ADMIN } from "src/lib/account-kind-refusals";
import { OwnerRequiredError } from "src/lib/auth-service";
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

import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  addSchoolAdminAction,
  createSchoolAction,
  removeSchoolAdminAction,
} from "../actions";

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

/** Every school except the harness's default one — the schools these rows create. */
async function createdSchools() {
  const schools = await getTestServices().schoolService.listSchools();
  return schools.filter((school) => school.id !== TEST_SCHOOL_ID);
}

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
    const state = await createSchoolAction(null, schoolForm("Acme", "acme"));

    expect(state.success).toBe(true);
    const schools = await createdSchools();
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
    const state = await createSchoolAction(null, schoolForm("Acme", "acme"));

    expect(state.success).toBe(false);
    expect(await createdSchools()).toHaveLength(0);
  });

  it.each([
    ["uppercase letters", "ACME"],
    ["a space", "acme school"],
    ["diacritics", "trường-a"],
    ["empty", ""],
  ])("refuses a slug with %s, and creates nothing", async (_label, slug) => {
    const state = await createSchoolAction(null, schoolForm("Acme", slug));

    expect(state.success).toBe(false);
    expect(await createdSchools()).toHaveLength(0);
  });

  it("refuses a blank name, and creates nothing", async () => {
    const state = await createSchoolAction(null, schoolForm("   ", "acme"));

    expect(state.success).toBe(false);
    expect(await createdSchools()).toHaveLength(0);
  });

  it("refuses a duplicate slug with a friendly message, and keeps one school", async () => {
    await ensureIndexes(db);
    await createSchoolAction(null, schoolForm("Acme", "acme"));

    const state = await createSchoolAction(
      null,
      schoolForm("A Different Name", "acme"),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("A school with that slug already exists");
    expect(await createdSchools()).toHaveLength(1);
  });

  it("allows two schools with the same name and different slugs", async () => {
    await createSchoolAction(null, schoolForm("Same Name", "same-name-a"));
    const state = await createSchoolAction(
      null,
      schoolForm("Same Name", "same-name-b"),
    );

    expect(state.success).toBe(true);
    expect(await createdSchools()).toHaveLength(2);
  });
});

function adminForm(schoolId: string, userId: string): FormData {
  const formData = new FormData();
  formData.set("schoolId", schoolId);
  formData.set("userId", userId);
  return formData;
}

/**
 * Feature: the platform owner manages a school's admins
 * As the platform owner
 * I want to add an existing account as a school's admin, and remove one
 * So that access to a school's data comes only from a recorded membership
 */
describe("Feature: the platform owner manages a school's admins", () => {
  it("adds the admin role and the membership, and stamps the marker", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();

    const state = await addSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(true);
    const user = await db
      .collection("user")
      .findOne({ _id: insert.insertedId });
    expect(user?.role).toBe("admin");
    expect(user?.schoolAccessManagedAt).toBeInstanceOf(Date);
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([
      userId,
    ]);
  });

  it("removes the membership but keeps the admin role, and stamps the marker", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();
    await addSchoolAdminAction(null, adminForm(school.id, userId));
    // Clear the add's stamp so only the remove can set it again.
    await db
      .collection("user")
      .updateOne(
        { _id: insert.insertedId },
        { $unset: { schoolAccessManagedAt: "" } },
      );

    const state = await removeSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(true);
    const user = await db
      .collection("user")
      .findOne({ _id: insert.insertedId });
    expect(user?.role).toBe("admin");
    expect(user?.schoolAccessManagedAt).toBeInstanceOf(Date);
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([]);
  });

  it("refuses when the caller is not the owner, and changes nothing", async () => {
    mockRequireOwnerSession.mockRejectedValue(new Error("not owner"));
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();

    const state = await addSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(false);
    const user = await db
      .collection("user")
      .findOne({ _id: insert.insertedId });
    expect(user?.role).toBeUndefined();
    expect(user?.schoolAccessManagedAt).toBeUndefined();
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([]);
  });

  it("refuses a non-owner's remove, and the membership stays", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();
    await addSchoolAdminAction(null, adminForm(school.id, userId));
    mockRequireOwnerSession.mockRejectedValue(new Error("not owner"));

    const state = await removeSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(false);
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([
      userId,
    ]);
  });

  it("refuses a stale form naming a deleted account, and writes nothing", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();
    await db.collection("user").deleteOne({ _id: insert.insertedId });

    const state = await addSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("That account no longer exists.");
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([]);
  });

  it("refuses a form naming a school that does not exist, and writes nothing", async () => {
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();

    const state = await addSchoolAdminAction(
      null,
      adminForm("no-such-school", userId),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("School not found");
    const user = await db
      .collection("user")
      .findOne({ _id: insert.insertedId });
    expect(user?.role).toBeUndefined();
    expect(user?.schoolAccessManagedAt).toBeUndefined();
    expect(
      await db.collection("school_membership").countDocuments({ userId }),
    ).toBe(0);
  });

  it.each([
    { case: "a school they are not an admin of", schoolExists: true },
    { case: "a school that does not exist", schoolExists: false },
  ])(
    "refuses removing an account from $case, and writes nothing",
    async ({ schoolExists }) => {
      const { schoolService } = getTestServices();
      const school = await schoolService.createSchool({
        name: "Acme",
        slug: "acme",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();

      const state = await removeSchoolAdminAction(
        null,
        adminForm(schoolExists ? school.id : "no-such-school", userId),
      );

      expect(state.success).toBe(false);
      expect(state.message).toBe(
        "This account is not an admin of this school.",
      );
      const user = await db
        .collection("user")
        .findOne({ _id: insert.insertedId });
      expect(user?.schoolAccessManagedAt).toBeUndefined();
    },
  );

  it("returns a readable error instead of throwing when removal fails", async () => {
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();
    await addSchoolAdminAction(null, adminForm(school.id, userId));
    vi.spyOn(schoolService, "removeMembership").mockRejectedValueOnce(
      new Error("connection reset"),
    );

    const state = await removeSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("connection reset");
  });

  it("refuses a second add of the same admin, and keeps exactly one membership", async () => {
    await ensureIndexes(db);
    const { schoolService } = getTestServices();
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "teacher@example.com" });
    const userId = insert.insertedId.toString();
    await addSchoolAdminAction(null, adminForm(school.id, userId));

    const state = await addSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe(
      "This account is already an admin of this school.",
    );
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([
      userId,
    ]);
  });

  it("refuses an account that has a student profile, writing no role or membership", async () => {
    await ensureIndexes(db);
    const { schoolDirectory, schoolService, studentService } =
      getTestServices();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const school = await schoolService.createSchool({
      name: "Acme",
      slug: "acme",
      createdBy: "owner-1",
    });
    const insert = await db
      .collection("user")
      .insertOne({ email: "student@example.com" });
    const userId = insert.insertedId.toHexString();
    const student = await studentService.createStudentDocument({
      authUserId: userId,
      username: "student-account",
      name: "Student Account",
      createdBy: "self-signup",
    });

    const state = await addSchoolAdminAction(
      null,
      adminForm(school.id, userId),
    );

    expect(state).toEqual({
      success: false,
      message: STUDENT_ACCOUNT_CANNOT_BE_ADMIN,
    });
    const user = await db
      .collection("user")
      .findOne({ _id: insert.insertedId });
    expect(user?.role).toBeUndefined();
    expect(user?.schoolAccessManagedAt).toBeUndefined();
    expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([]);
    expect(await schoolDirectory.findByUsername("student-account")).toEqual(
      student,
    );
    expect(warn).toHaveBeenCalledWith("action.addSchoolAdminAction.refused", {
      "lms.reason": "has-student-profile",
      "lms.owner.id": "owner-1",
      "lms.user.id": userId,
    });
  });
});

/**
 * Feature: a refused owner-only school change records which admin tried
 * As the platform owner reviewing logs
 * I want a signed-in non-owner admin's refused school change logged as
 * "not-owner" with their user id
 * So that an attempted privilege change is traceable to a person
 */
describe("Feature: a refused owner-only school change records which admin tried", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      "createSchoolAction",
      () => createSchoolAction(null, schoolForm("Acme", "acme")),
    ],
    [
      "addSchoolAdminAction",
      () =>
        addSchoolAdminAction(
          null,
          adminForm("school-1", "0123456789abcdef01234567"),
        ),
    ],
    [
      "removeSchoolAdminAction",
      () =>
        removeSchoolAdminAction(
          null,
          adminForm("school-1", "0123456789abcdef01234567"),
        ),
    ],
  ])(
    "%s logs a non-owner admin as not-owner with their user id",
    async (name, act) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockRequireOwnerSession.mockRejectedValue(
        new OwnerRequiredError("non-owner-admin-1"),
      );

      const state = await act();

      expect(state.success).toBe(false);
      expect(warn).toHaveBeenCalledWith(`action.${name}.refused`, {
        "lms.reason": "not-owner",
        "lms.owner.id": "non-owner-admin-1",
      });
    },
  );
});
