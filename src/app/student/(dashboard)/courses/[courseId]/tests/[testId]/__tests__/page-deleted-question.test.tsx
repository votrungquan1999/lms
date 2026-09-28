// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * Configures the auth mock to return a student session for the given id.
 */
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

describe("Feature: a student's progress ignores an answer to a question that was deleted", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("counts only answers to questions that still exist, in the progress bar and the submit confirmation", async () => {
    // Given: a 3-question test. The student answered Q1 and Q3 but not Q2,
    // then the teacher deleted Q3 — 2 questions remain, 1 of them answered.
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
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Please answer.",
      createdBy: "admin-1",
      type: "free_text",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Please answer.",
      createdBy: "admin-1",
      type: "free_text",
    });
    const q3 = await services.questionService.addQuestion(test.id, {
      title: "Q3",
      content: "Please answer.",
      createdBy: "admin-1",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-stu",
      username: "stu",
      name: "Stu Dent",
      createdBy: "admin-1",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin-1",
    );
    for (const questionId of [q1.id, q3.id]) {
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId,
        studentId: student.id,
        answer: { type: "free_text", text: "My answer" },
      });
    }
    await services.questionService.deleteQuestion(q3.id, "admin-1");

    // When: the student opens the test and starts to submit it.
    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    const user = userEvent.setup();
    render(ui);

    // Then: progress reads 1 of the 2 remaining questions, and the
    // confirmation never claims every question is answered while Q2 is blank.
    expect(screen.getByText("1 / 2 questions answered")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Submit Test for Grading" }),
    );
    expect(screen.getByText("1 question unanswered.")).toBeInTheDocument();
    expect(screen.queryByText(/You have answered all/)).toBeNull();
  });
});
