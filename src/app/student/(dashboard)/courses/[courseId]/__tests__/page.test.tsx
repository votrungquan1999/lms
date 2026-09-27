// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentCourseDetailPage from "../page";

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
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
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
 * Seeds a course + test + 1 free-text question, submitted and graded so the
 * test is internally Graded, for a student enrolled in it.
 */
async function seedInternallyGradedScenario(opts: {
  showGradeAfterSubmit: boolean;
}) {
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
    showGradeAfterSubmit: opts.showGradeAfterSubmit,
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain",
    createdBy: "admin",
    type: "free_text",
  });
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
  await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "my answer" },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 80,
    feedback: "Good",
    gradedBy: "admin",
  });
  return { services, course, test, student };
}

/**
 * Feature: Student course page hides a Graded-but-withheld test's score
 * As a student whose teacher hasn't released a test's grades
 * I want the course page to treat it as not-yet-graded
 * So that I never see a score or a "graded" count the teacher hasn't released
 */
describe("Feature: Student course page — Graded-but-withheld tests stay hidden", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("hides the average score, counts the test as not graded in the header, and shows a 'Submitted' row badge while grades are withheld", async () => {
    const { course, student } = await seedInternallyGradedScenario({
      showGradeAfterSubmit: false,
    });
    // No releaseGrades, no releaseGradeToStudent — internally Graded, but
    // nothing has been released to this student.

    mockStudentSession(student.id);

    const ui = await StudentCourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    // No leaked average score anywhere on the page.
    expect(screen.queryByText(/80\s*\/\s*100/)).toBeNull();
    // The header count treats this test as not (yet) graded.
    expect(screen.getByText(/0 of 1 test/i)).toBeInTheDocument();
    // The row's own status badge follows the same student-facing rule.
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByText("Graded")).not.toBeInTheDocument();
  });

  it("shows the average score and counts the test as graded once grades are released", async () => {
    const { services, course, test, student } =
      await seedInternallyGradedScenario({ showGradeAfterSubmit: false });
    // An explicit test-wide release, not auto-show.
    await services.testService.releaseGrades(test.id, "admin");

    mockStudentSession(student.id);

    const ui = await StudentCourseDetailPage({
      params: Promise.resolve({ courseId: course.id }),
    });
    render(ui);

    expect(screen.getByText(/80\s*\/\s*100/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 test/i)).toBeInTheDocument();
    expect(screen.getByText("Graded")).toBeInTheDocument();
  });
});
