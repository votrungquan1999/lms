import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTestFeedbackAction } from "../actions";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

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

/** An enrolled student of a course with one test. */
async function seed() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin-1",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin-1",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-ana",
    username: "ana",
    name: "Ana",
    createdBy: "admin-1",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin-1",
  );
  return { courseId: course.id, testId: test.id, studentId: student.id };
}

/** The form the overall-feedback box posts. */
function feedbackForm(
  ids: { courseId: string; testId: string; studentId: string },
  feedback: string,
): FormData {
  const form = new FormData();
  form.set("testId", ids.testId);
  form.set("courseId", ids.courseId);
  form.set("studentId", ids.studentId);
  form.set("feedback", feedback);
  return form;
}

describe("setTestFeedbackAction", () => {
  it("says the feedback was saved when text is written and cleared when it is emptied", async () => {
    const ids = await seed();

    const written = await setTestFeedbackAction(
      null,
      feedbackForm(ids, "Well done"),
    );
    const emptied = await setTestFeedbackAction(null, feedbackForm(ids, ""));

    expect(written).toEqual({ success: true, message: "Feedback saved" });
    expect(emptied).toEqual({ success: true, message: "Feedback cleared" });
  });
});
