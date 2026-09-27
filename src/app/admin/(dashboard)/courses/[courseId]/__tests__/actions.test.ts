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

import {
  createTestAction,
  disableInviteLinkAction,
  getInviteLinkAction,
  regenerateInviteLinkAction,
} from "../actions";

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

/**
 * Feature: an admin issues a fresh join link, and the previous one stops working
 * As an admin
 * I want to replace a course's join link
 * So that anyone still holding the old link can no longer use it
 */
describe("Feature: an admin issues a fresh join link, and the previous one stops working", () => {
  it("replaces the stored token with a new one, discarding the old", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const oldToken = await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin issues a fresh link
    const result = await regenerateInviteLinkAction(null, formData);

    // Then a new, different token is minted and persisted
    expect(result.success).toBe(true);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toMatch(UUID_PATTERN);
    expect(persisted?.inviteToken).not.toBe(oldToken);
  });

  it("rejects a non-admin caller and leaves the stored token unchanged", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const oldToken = await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When a non-admin caller attempts to issue a fresh link
    requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
    const result = await regenerateInviteLinkAction(null, formData);

    // Then it is rejected and the old token is still the one stored
    expect(result.success).toBe(false);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toBe(oldToken);
  });

  it("revalidates the course page after issuing a new token", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin issues a fresh link
    await regenerateInviteLinkAction(null, formData);

    // Then the course page is revalidated so the new link actually shows
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/courses/${course.id}`);
  });
});

/**
 * Feature: an admin switches a course's join link off entirely
 * As an admin
 * I want to turn off a course's join link
 * So that nobody can use it any more
 */
describe("Feature: an admin switches a course's join link off entirely", () => {
  it("clears the stored token so no link resolves to this course any more", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin turns off the join link
    const result = await disableInviteLinkAction(null, formData);

    // Then the stored token is cleared
    expect(result.success).toBe(true);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toBeNull();
  });

  it("rejects a non-admin caller and leaves the stored token unchanged", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When a non-admin caller attempts to turn off the join link
    requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
    const result = await disableInviteLinkAction(null, formData);

    // Then it is rejected and the token is still active
    expect(result.success).toBe(false);
    const persisted = await courseService.getCourse(course.id);
    expect(persisted?.inviteToken).toBe(token);
  });

  it("revalidates the course page after turning off the join link", async () => {
    // Given a course with an existing join link
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    await courseService.getOrCreateInviteToken(course.id);

    const formData = new FormData();
    formData.set("courseId", course.id);

    // When the admin turns off the join link
    await disableInviteLinkAction(null, formData);

    // Then the course page is revalidated so the dead link stops showing
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/courses/${course.id}`);
  });
});

describe("Feature: Create Test names a blank title as a field error", () => {
  it("returns a title field error, not just the form-wide message", async () => {
    // Given a course to hold the new test
    const { courseService } = getTestServices();
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });

    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.set("title", "   ");
    formData.set("description", "");

    // When the admin submits a whitespace-only title
    const result = await createTestAction(null, formData);

    // Then the error names the title field, not only the banner
    expect(result.success).toBe(false);
    expect(result.fieldErrors?.title).toBe("Test title is required");
  });
});
