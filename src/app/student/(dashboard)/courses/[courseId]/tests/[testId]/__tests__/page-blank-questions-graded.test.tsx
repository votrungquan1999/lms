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

describe("Feature: Student sees grades and average for a submitted test with one blank free-text question once the answered question is graded", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders the per-question grade chip and the average score (no longer gated behind the 'waiting to be graded' branch) when a 2-question submitted test has one blank free-text question and the teacher graded the answered one", async () => {
    // Given: a 2-question test (`showGradeAfterSubmit: true` to open the
    // visibility gate cleanly — this isolates the test from the
    // orthogonal grade-release logic). The student answered Q1 only,
    // explicitly submitted, and the teacher graded Q1=80.
    const services = getTestServices();

    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test with one blank",
      description: "",
      createdBy: "admin-1",
      showGradeAfterSubmit: true,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Answered question",
      content: "Please answer.",
      createdBy: "admin-1",
      type: "free_text",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Skipped question",
      content: "Optional.",
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

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    // Q2 deliberately left blank — no submitAnswer call.
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 80,
      feedback: "Good",
      gradedBy: "admin-1",
    });

    // When: the student opens the test page.
    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: the grade chip for the answered question is visible AND the
    // average-score block is rendered — proving the page reached the
    // Graded branch end-to-end through the corrected services.
    expect(screen.getByText(/80\s*\/\s*100/)).toBeInTheDocument();
    expect(screen.getByText(/average score/i)).toBeInTheDocument();

    // And: the "waiting to be graded" block must NOT appear. This is
    // the inverse of the existing page-ai-suggestions-isolation test —
    // if Step 1 regressed, the page would land on this branch instead.
    expect(screen.queryByText(/waiting to be graded/i)).toBeNull();

    // And: the blank question (Q2) is marked "No answer — 0", matching
    // the teacher's own "No answer — counts as 0" wording and explaining
    // why the average is less than 80.
    expect(screen.getByText("No answer — 0")).toBeInTheDocument();
  });

  it("does not mark the blank question 'No answer — 0' while the teacher has not released grades", async () => {
    // Given: the same graded submission (Q1 answered and scored, Q2 blank),
    // but grades are neither shown after submit nor released.
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test with one blank",
      description: "",
      createdBy: "admin-1",
      showGradeAfterSubmit: false,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Answered question",
      content: "Please answer.",
      createdBy: "admin-1",
      type: "free_text",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Skipped question",
      content: "Optional.",
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
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 80,
      feedback: "Good",
      gradedBy: "admin-1",
    });

    // When: the student opens the test page.
    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: no score of any kind reaches the student — neither the
    // average nor the blank question's 0.
    expect(screen.queryByText(/average score/i)).toBeNull();
    expect(screen.queryByText("No answer — 0")).toBeNull();
  });

  it("does not show the 'waiting to be graded' banner when the submission is entirely blank and grades are visible", async () => {
    // Given: a 2-question test the student submits without answering
    // anything — no submitAnswer calls at all, so auto-grading (MC-only)
    // never runs and no real grade rows exist.
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "All-blank test",
      description: "",
      createdBy: "admin-1",
      showGradeAfterSubmit: true,
    });
    await services.questionService.addQuestion(test.id, {
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
    await services.testSubmissionService.submitTest(test.id, student.id);

    // When: the student opens the test page.
    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: the all-blank submission auto-reaches Graded (D5), so the
    // average (0) renders — and "waiting to be graded" must not also
    // appear, since the two claims contradict each other.
    expect(screen.getByText(/average score/i)).toBeInTheDocument();
    expect(screen.queryByText(/waiting to be graded/i)).toBeNull();
  });
});
