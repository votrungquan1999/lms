// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AnswerRevealMode } from "src/lib/test-service";
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

/**
 * Seeds a course + test + one graded free_text question + one enrolled,
 * submitted student, then renders the student test page. Shared by every
 * scenario in this file that only differs by mode/gate/solution/referenceAnswer.
 */
async function renderGradedFreeTextScenario(opts: {
  answerRevealMode: AnswerRevealMode;
  showCorrectAnswerAfterSubmit?: boolean;
  studentText: string;
  solution?: string;
  referenceAnswer?: string;
}) {
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
    answerRevealMode: opts.answerRevealMode,
    ...(opts.showCorrectAnswerAfterSubmit !== undefined
      ? { showCorrectAnswerAfterSubmit: opts.showCorrectAnswerAfterSubmit }
      : {}),
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain something.",
    createdBy: "admin-1",
    type: "free_text",
    referenceAnswer: opts.referenceAnswer,
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
    answer: { type: "free_text", text: opts.studentText },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 80,
    feedback: "",
    ...(opts.solution !== undefined ? { solution: opts.solution } : {}),
    gradedBy: "admin-1",
  });

  mockStudentSession(student.id);
  const ui = await StudentTestDetailPage({
    params: Promise.resolve({ courseId: course.id, testId: test.id }),
  });
  render(ui);
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

  // Regression pin for the untouched arm (Step 7). No production change was
  // needed for this test — Step 6's `mode === "diff"` conjunct and the
  // pre-existing `!!grade.solution` check already produce this behavior.
  it("diff mode: still shows the side-by-side comparison, and does not fall back to referenceAnswer when no solution is set (D10)", async () => {
    // Given a diff-mode question graded with a solution differing from the answer
    await renderGradedFreeTextScenario({
      answerRevealMode: "diff",
      studentText: "Student's diff answer.",
      solution: "Diff mode correct answer.",
    });

    // Then the comparison is constructed with the student's answer and the solution
    expect(diffProps).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: "Student's diff answer.",
        newValue: "Diff mode correct answer.",
      }),
    );
    diffProps.mockClear();

    // Given a second diff-mode question graded with no solution, but an
    // authored referenceAnswer
    await renderGradedFreeTextScenario({
      answerRevealMode: "diff",
      studentText: "Second answer, ungraded solution.",
      referenceAnswer: "Should never appear anywhere on this page.",
    });

    // Then no comparison is built, D10's no-fallback rule holds (the
    // referenceAnswer never appears), and the student still sees their own answer
    expect(diffProps).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Should never appear anywhere on this page."),
    ).toBeNull();
    expect(
      screen.getByText("Second answer, ungraded solution."),
    ).toBeInTheDocument();
  });

  it("diff mode: withholds the comparison when correct answers are not visible (D31)", async () => {
    // Given a diff-mode question graded with a solution, but the teacher has
    // not made correct answers visible
    await renderGradedFreeTextScenario({
      answerRevealMode: "diff",
      showCorrectAnswerAfterSubmit: false,
      studentText: "Gate-closed answer.",
      solution: "Should stay hidden until released.",
    });

    // Then no comparison is built and the solution text never appears
    expect(diffProps).not.toHaveBeenCalled();
    expect(screen.queryByText("Should stay hidden until released.")).toBeNull();
    // And the student still sees their own answer (falls back to "Your Answer")
    expect(screen.getByText("Gate-closed answer.")).toBeInTheDocument();
  });

  it("plain mode: withholds the correct answer when correct answers are not visible (D31)", async () => {
    // Given a plain-mode question graded with a solution, but the teacher has
    // not made correct answers visible
    await renderGradedFreeTextScenario({
      answerRevealMode: "plain",
      showCorrectAnswerAfterSubmit: false,
      studentText: "Gate-closed plain answer.",
      solution: "Should stay hidden until released.",
    });

    // Then the correct answer text never appears
    expect(screen.queryByText("Should stay hidden until released.")).toBeNull();
    // And the student still sees their own answer
    expect(screen.getByText("Gate-closed plain answer.")).toBeInTheDocument();
  });
});
