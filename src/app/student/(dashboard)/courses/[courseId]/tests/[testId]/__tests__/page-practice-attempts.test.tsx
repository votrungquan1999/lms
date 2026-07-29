// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { McOption } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

// Same auth-singleton mock plumbing as the other practice-mode test files.
const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();

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
  }),
}));

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

/**
 * Seeds a course + practice test + 1 single_select MC question + 1 enrolled
 * student. MC is used (rather than free_text) so the reveal card is
 * guaranteed to render regardless of authored referenceAnswer/explanation
 * (R4's graceful-partial omission only applies to free_text).
 */
async function seedPracticeMcAttemptScenario() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Test",
    description: "",
    createdBy: "admin",
    isPractice: true,
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Pick one",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "A (correct)", isCorrect: true },
      { text: "B (wrong)", isCorrect: false },
    ],
  });
  const [correctOption, wrongOption] = question.options as McOption[];

  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "u1",
    name: "Stu",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );

  return {
    services,
    course,
    test,
    question,
    correctOption,
    wrongOption,
    student,
  };
}

describe("Feature: Student test page — practice-mode attempt count", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the number of attempts made on a practice question after 2 distinct submissions", async () => {
    const {
      services,
      course,
      test,
      question,
      correctOption,
      wrongOption,
      student,
    } = await seedPracticeMcAttemptScenario();

    // 2 distinct submissions — an identical resubmit is rejected, so the
    // second attempt must differ in content from the first.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption.id] },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [correctOption.id] },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
  });
});
