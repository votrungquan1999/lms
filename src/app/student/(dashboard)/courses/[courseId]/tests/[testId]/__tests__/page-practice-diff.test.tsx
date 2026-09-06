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

// Same convention as diff-viewer.test.tsx / page-answer-reveal-mode.test.tsx:
// assert the diff library's props, never its DOM.
const { diffProps } = vi.hoisted(() => ({ diffProps: vi.fn() }));

vi.mock("react-diff-viewer-continued", () => ({
  default: (props: {
    oldValue: string;
    newValue: string;
    rightTitle?: string;
  }) => {
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

describe("Feature: Student test page — practice-mode diff reveal (free_text)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lines the student's practice attempt up against the model answer when the test's answer reveal mode is diff", async () => {
    const STUDENT_TEXT = "My practice attempt.";
    const REFERENCE_ANSWER = "The authored model answer.";

    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Practice diff test",
      description: "",
      createdBy: "admin-1",
      isPractice: true,
      answerRevealMode: "diff",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain something.",
      createdBy: "admin-1",
      type: "free_text",
      referenceAnswer: REFERENCE_ANSWER,
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

    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // The comparison was built with the student's attempt against the model
    // answer, labeled "Model Answer" on the right (not the graded view's
    // "Correct Solution").
    expect(diffProps).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: STUDENT_TEXT,
        newValue: REFERENCE_ANSWER,
        rightTitle: "Model Answer",
      }),
    );
    // The plain model-answer text block was not used instead (it's swallowed
    // inside the mocked DiffViewer, which renders null).
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
  });
});
