// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { FreeTextQuestion, Question } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();
const requireAdminSession = vi.fn();

// Captures the `questions` prop the page hands downstream — the scrub's real
// target. Asserting only on rendered text would pass even if the answer key
// were still in the payload and merely hidden by a render gate.
const capturedQuestions: Question[][] = [];
vi.mock("../test-questions-section", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../test-questions-section")>();
  return {
    TestQuestionsSection: (
      props: Parameters<typeof actual.TestQuestionsSection>[0],
    ) => {
      capturedQuestions.push(props.questions);
      return actual.TestQuestionsSection(props);
    },
  };
});

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
  cookies: vi.fn(),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    requireStudentSession: (...args: unknown[]) =>
      mockRequireStudentSession(...args),
    requireAdminSession: (...args: unknown[]) => requireAdminSession(...args),
  }),
}));

const REFERENCE_ANSWER = "Photosynthesis converts light into chemical energy.";

function capturedFreeTextQuestion(): FreeTextQuestion | undefined {
  const q = capturedQuestions.at(-1)?.[0];
  return q?.type === "free_text" ? q : undefined;
}

function mockStudentSession(studentId: string) {
  const session = {
    role: "student" as const,
    userId: `auth-${studentId}`,
    username: `u-${studentId}`,
    studentId,
  };
  mockGetSession.mockResolvedValue(session);
  mockRequireStudentSession.mockResolvedValue(session);
}

/** Seeds a graded, submitted student on a test that withholds correct answers. */
async function seedWithheldAndGraded() {
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
    answerRevealMode: "plain",
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain photosynthesis",
    createdBy: "admin-1",
    type: "free_text",
    referenceAnswer: REFERENCE_ANSWER,
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${test.id}`,
    username: `u-${test.id}`,
    name: "Stu",
    createdBy: "admin-1",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin-1",
  );
  await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "my attempt" },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 80,
    feedback: "",
    gradedBy: "admin-1",
  });
  return { services, course, test, student };
}

async function renderStudentPage(
  courseId: string,
  testId: string,
  studentId: string,
) {
  mockStudentSession(studentId);
  const ui = await StudentTestDetailPage({
    params: Promise.resolve({ courseId, testId }),
  });
  render(ui);
}

describe("Feature: a student sees the correct answer once the teacher releases it", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedQuestions.length = 0;
    await setupTestDb();
    requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("withholds the model answer until release, then delivers it", async () => {
    const { course, test, student } = await seedWithheldAndGraded();

    // Before: graded and submitted, but answers were withheld — the model
    // answer must not even reach the payload.
    await renderStudentPage(course.id, test.id, student.id);
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
    // Pin that something WAS captured — the optional chain below would also
    // be undefined if the capture never happened, hiding a leak.
    expect(capturedQuestions.at(-1)).toHaveLength(1);
    expect(capturedFreeTextQuestion()).toBeDefined();
    expect(capturedFreeTextQuestion()?.referenceAnswer).toBeUndefined();

    // Imported here, not at the top: a static import of the admin action
    // initialises before this file's service mock and throws on hoisting.
    const { releaseCorrectAnswersAction } = await import(
      "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions"
    );
    const formData = new FormData();
    formData.set("testId", test.id);
    formData.set("courseId", course.id);
    const result = await releaseCorrectAnswersAction(null, formData);
    expect(result.success).toBe(true);

    // After: the same student, same grade — only the release changed.
    await renderStudentPage(course.id, test.id, student.id);
    expect(capturedFreeTextQuestion()?.referenceAnswer).toBe(REFERENCE_ANSWER);
    expect(screen.getAllByText(REFERENCE_ANSWER).length).toBeGreaterThan(0);
  });
});
