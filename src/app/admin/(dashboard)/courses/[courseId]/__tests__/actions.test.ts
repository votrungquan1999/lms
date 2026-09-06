import { revalidatePath } from "next/cache";
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

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import { getInviteLinkAction } from "../actions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: an admin gets a shareable join link for a course
 * As an admin
 * I want a join link for my course
 * So that I can share it with prospective students
 */
describe("Feature: an admin gets a shareable join link for a course", () => {
  it("mints a token on first request and returns the same one on request again", async () => {
    // Given a course with no invite token yet
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin asks for the join link
    const first = await getInviteLinkAction(null, formData);

    // Then a real token is minted and persisted
    expect(first.success).toBe(true);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toMatch(UUID_PATTERN);

    // When the admin asks again
    const second = await getInviteLinkAction(null, formData);

    // Then the SAME token comes back — one static token per course (D2)
    expect(second.success).toBe(true);
    const persistedAgain = await courseService.getCourse(course.id);
    expect(persistedAgain?.inviteToken).toBe(persisted?.inviteToken);
  });

  it("rejects a non-admin caller and mints no token", async () => {
    // Given a course with no invite token yet
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When a non-admin caller asks for the join link
    requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
    const result = await getInviteLinkAction(null, formData);

    // Then it is rejected and no token is ever stored
    expect(result.success).toBe(false);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toBeNull();
  });

  it("revalidates the course page after minting a token", async () => {
    // Given a course with no invite token yet
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin asks for the join link
    await getInviteLinkAction(null, formData);

    // Then the course page is revalidated so the new link actually shows
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/courses/${course.id}`);
  });
});
