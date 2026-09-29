import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real services backed by a per-test Mongo.
vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import { TEST_SCHOOL } from "src/tests/create-test-db";
import { createCourseAction } from "../actions";

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("createCourseAction", () => {
  it("returns a title field error for a whitespace-only title, without creating a course", async () => {
    const form = new FormData();
    form.set("title", "   ");
    form.set("description", "");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createCourseAction(null, form);

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.title).toBe("Course title is required");

    const services = getTestServices();
    const courses = await services.courseService.listCourses();
    expect(courses).toHaveLength(0);
  });
});

/**
 * Feature: a new course lands in the admin's current school
 * As a school admin working in one school
 * I want a course I create to belong to that school
 * So that only that school's admins ever see it
 */
describe("Feature: a new course lands in the admin's current school", () => {
  it("creates the course in the acting admin's school, not the default one", async () => {
    const school = await addTestSchool("School B");
    requireAdminSession.mockResolvedValue({
      userId: "admin-b",
      role: "admin",
      school,
    });
    const form = new FormData();
    form.set("title", "Algebra");
    form.set("description", "");
    form.set("expectedSchoolId", school.id);

    const result = await createCourseAction(null, form);

    expect(result.success).toBe(true);
    const ownCourses = await getTestServices(
      school.id,
    ).courseService.listCourses();
    expect(ownCourses.map((course) => course.title)).toEqual(["Algebra"]);
    expect(await getTestServices().courseService.listCourses()).toEqual([]);
  });
});
