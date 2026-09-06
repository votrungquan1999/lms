// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

// Same convention as diff-viewer.test.tsx: assert the diff library's props,
// never its DOM, so these tests don't depend on react-diff-viewer-continued's
// internals rendering correctly under jsdom.
const { diffProps } = vi.hoisted(() => ({ diffProps: vi.fn() }));

vi.mock("react-diff-viewer-continued", () => ({
  default: (props: { oldValue: string; newValue: string }) => {
    diffProps(props);
    return null;
  },
}));

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

describe("Feature: Student test page — free-text answer reveal mode after grading", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("plain mode: shows the student's own answer and the correct answer written out, not a diff", async () => {
    const STUDENT_TEXT = "My attempt at the answer.";
    const CORRECT_TEXT = "The teacher's correct solution text.";

    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Plain-mode test",
      description: "",
      createdBy: "admin-1",
      answerRevealMode: "plain",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain something.",
      createdBy: "admin-1",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
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
      answer: { type: "free_text", text: STUDENT_TEXT },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      solution: CORRECT_TEXT,
      gradedBy: "admin-1",
    });

    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Own answer and the correct answer are both written out as plain text.
    expect(screen.getByText(STUDENT_TEXT)).toBeInTheDocument();
    expect(screen.getByText(CORRECT_TEXT)).toBeInTheDocument();
    // No side-by-side comparison was ever constructed.
    expect(diffProps).not.toHaveBeenCalled();
  });
});
