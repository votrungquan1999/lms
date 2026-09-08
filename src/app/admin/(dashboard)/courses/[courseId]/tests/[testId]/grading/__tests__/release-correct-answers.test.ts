import { revalidatePath } from "next/cache";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { releaseCorrectAnswersAction } from "../actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// `withSpan` calls this on every thrown error; without it a real failure
// surfaces as a missing-export error instead of its own message.
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** Seeds a course and a test that deliberately withholds correct answers. */
async function seedWithheldTest() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin-1",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin-1",
    showCorrectAnswerAfterSubmit: false,
  });
  return { services, course, test };
}

describe("Feature: a teacher releases correct answers they had withheld", () => {
  it("stamps the test as released so the withheld answers become visible", async () => {
    const { services, course, test } = await seedWithheldTest();

    // Precondition: withholding is real, and nothing has been released.
    const before = await services.testService.getTest(test.id);
    expect(before?.showCorrectAnswerAfterSubmit).toBe(false);
    expect(before?.correctAnswersReleasedAt).toBeNull();

    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);

    const result = await releaseCorrectAnswersAction(null, formData);

    expect(result.success).toBe(true);
    const after = await services.testService.getTest(test.id);
    expect(after?.correctAnswersReleasedAt).toBeInstanceOf(Date);
  });

  it("refreshes the student's own page, which is the whole audience for the release", async () => {
    const { course, test } = await seedWithheldTest();

    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    await releaseCorrectAnswersAction(null, formData);

    const paths = vi.mocked(revalidatePath).mock.calls.map((c) => c[0]);
    // Without this the student keeps seeing the withheld view on their next
    // visit — the release would be invisible to the only person it is for.
    expect(paths).toContain(`/student/courses/${course.id}/tests/${test.id}`);
    // The admin surfaces that display release state.
    expect(paths).toContain(
      `/admin/courses/${course.id}/tests/${test.id}/grading`,
    );
    expect(paths).toContain(`/admin/courses/${course.id}/tests/${test.id}`);
  });

  it("writes nothing when the caller is not an admin", async () => {
    const { services, course, test } = await seedWithheldTest();
    requireAdminSession.mockRejectedValue(new Error("not an admin"));

    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);

    const result = await releaseCorrectAnswersAction(null, formData);

    expect(result.success).toBe(false);
    // The refusal must be a non-write, not just a message: this action is a
    // public POST endpoint.
    const after = await services.testService.getTest(test.id);
    expect(after?.correctAnswersReleasedAt).toBeNull();
  });
});
