import type { Db } from "mongodb";
import { createAuthService } from "src/lib/auth-service";
import { AdminSession, isSchoolAdminSession } from "src/lib/session";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { testConfig } from "src/tests/auth-test-helpers";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// A real AuthService (for real registerStudent) is built per-test and exposed here.
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));

import { createCourseAction } from "../courses/actions";
import { createPoolAction } from "../pools/actions";
import { createStudentAction } from "../students/actions";
import { bulkImportStudentsAction } from "../students/bulk-import-actions";

// The admin gate is stubbed; the session's school always stays TEST_SCHOOL
// (the "current" tab), and rows vary only expectedSchoolId.
let db: Db;

beforeEach(async () => {
  ({ db } = await setupTestDb());
  const authService = createAuthService(
    db,
    testConfig(),
    realAuthServiceDeps(db),
  );
  const session = new AdminSession({
    userId: "admin-1",
    email: "admin@example.com",
    school: TEST_SCHOOL,
  });
  if (!isSchoolAdminSession(session)) {
    throw new Error("the stubbed admin must have a school");
  }
  vi.spyOn(authService, "requireAdminSession").mockResolvedValue(session);
  authHolder.authService = authService;
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a teacher who switched school in another tab is stopped, instead
 * of creating a course, pool or student in the wrong school
 * As a school admin with a stale create dialog open
 * I want the create to be refused when my active school no longer matches
 * So that a course, pool, student or import can never land in the wrong school
 */
describe("Feature: a stale create dialog is stopped when the active school has changed", () => {
  it("createCourseAction refuses when the dialog's school no longer matches the session, and creates no course", async () => {
    const stale = await addTestSchool("School B");
    const form = new FormData();
    form.set("title", "Algorithms");
    form.set("description", "");
    form.set("expectedSchoolId", stale.id);

    const result = await createCourseAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    // In no school at all, the stale one included.
    expect(await db.collection("course").countDocuments()).toBe(0);
  });

  it("createCourseAction still creates a course when the dialog's school matches the session", async () => {
    const form = new FormData();
    form.set("title", "Algorithms");
    form.set("description", "");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createCourseAction(null, form);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices().courseService.listCourses()).map(
        (course) => course.title,
      ),
    ).toEqual(["Algorithms"]);
  });

  it("createPoolAction refuses when the dialog's school no longer matches the session, and creates no pool", async () => {
    const stale = await addTestSchool("School B");
    const form = new FormData();
    form.set("name", "Algebra basics");
    form.set("description", "");
    form.set("expectedSchoolId", stale.id);

    const result = await createPoolAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    // In no school at all, the stale one included.
    expect(await db.collection("question_pool").countDocuments()).toBe(0);
  });

  it("createPoolAction still creates a pool when the dialog's school matches the session", async () => {
    const form = new FormData();
    form.set("name", "Algebra basics");
    form.set("description", "");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createPoolAction(null, form);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices().questionPoolService.listPools()).map(
        (pool) => pool.name,
      ),
    ).toEqual(["Algebra basics"]);
  });

  it("createStudentAction refuses when the dialog's school no longer matches the session, and creates no student or sign-in account", async () => {
    const stale = await addTestSchool("School B");
    const form = new FormData();
    form.set("name", "Alice");
    form.set("username", "alice");
    form.set("password", "secret123");
    form.set("expectedSchoolId", stale.id);

    const result = await createStudentAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
  });

  it("createStudentAction still creates a student when the dialog's school matches the session", async () => {
    const form = new FormData();
    form.set("name", "Alice");
    form.set("username", "alice");
    form.set("password", "secret123");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createStudentAction(null, form);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices().studentService.listStudents()).map(
        (student) => student.username,
      ),
    ).toEqual(["alice"]);
  });

  it("bulkImportStudentsAction refuses when the dialog's school no longer matches the session, and creates nobody, even with an unrelated course-check failure", async () => {
    const stale = await addTestSchool("School B");

    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice", password: "secret123" }],
      ["nonexistent-course"],
      stale.id,
    );

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
  });

  it("bulkImportStudentsAction still imports when the dialog's school matches the session", async () => {
    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice", password: "secret123" }],
      [],
      TEST_SCHOOL.id,
    );

    expect(result.success).toBe(true);
    expect(
      (await getTestServices().studentService.listStudents()).map(
        (student) => student.username,
      ),
    ).toEqual(["alice"]);
  });

  // An old cached tab or a crafted POST carries no expectedSchoolId at all.
  it("createCourseAction refuses a post with no expectedSchoolId, and creates no course", async () => {
    const form = new FormData();
    form.set("title", "Algorithms");
    form.set("description", "");

    const result = await createCourseAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("course").countDocuments()).toBe(0);
  });

  it("createPoolAction refuses a post with no expectedSchoolId, and creates no pool", async () => {
    const form = new FormData();
    form.set("name", "Algebra basics");
    form.set("description", "");

    const result = await createPoolAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("question_pool").countDocuments()).toBe(0);
  });

  it("createStudentAction refuses a post with no expectedSchoolId, and creates no student or sign-in account", async () => {
    const form = new FormData();
    form.set("name", "Alice");
    form.set("username", "alice");
    form.set("password", "secret123");

    const result = await createStudentAction(null, form);

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
  });

  it("bulkImportStudentsAction refuses a call with no expectedSchoolId, and creates nobody", async () => {
    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice", password: "secret123" }],
      [],
      undefined as unknown as string,
    );

    expect(result).toEqual({
      success: false,
      message: "Your active school changed",
    });
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
  });
});
