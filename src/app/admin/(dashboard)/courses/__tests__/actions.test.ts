import {
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

import { createCourseAction } from "../actions";

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
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

    const result = await createCourseAction(null, form);

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.title).toBe("Course title is required");

    const services = getTestServices();
    const courses = await services.courseService.listCourses();
    expect(courses).toHaveLength(0);
  });
});
