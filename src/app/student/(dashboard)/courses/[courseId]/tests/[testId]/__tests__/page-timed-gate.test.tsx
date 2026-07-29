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
 * Seeds a course + test + 1 question + 1 enrolled student. `timeLimitMinutes`
 * null leaves the test untimed; a number makes it timed.
 */
async function seedTest(timeLimitMinutes: number | null) {
  const s = getTestServices();
  const course = await s.courseService.createCourse({
    title: "Course",
    description: "",
    createdBy: "admin",
  });
  const test = await s.testService.createTest(course.id, {
    title: "Quiz",
    description: "",
    createdBy: "admin",
  });
  if (timeLimitMinutes !== null) {
    await s.testService.updateTestSettings(test.id, {
      showGradeAfterSubmit: true,
      showCorrectAnswerAfterSubmit: true,
      timeLimitMinutes,
      isPractice: false,
      updatedBy: "admin",
    });
  }
  await s.questionService.addQuestion(test.id, {
    title: "What is 2+2?",
    content: "Answer it.",
    createdBy: "admin",
  });
  const student = await s.studentService.createStudentDocument({
    authUserId: "auth-stu",
    username: "stu",
    name: "Stu",
    createdBy: "admin",
  });
  await s.enrollmentService.enrollStudent(course.id, student.id, "admin");
  return { courseId: course.id, testId: test.id, studentId: student.id, s };
}

describe("Student timed test — Start gate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });
  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows a Start control and hides the questions for a timed, not-yet-started test", async () => {
    // Given a timed test the student has not started.
    const { courseId, testId, studentId } = await seedTest(30);
    mockStudentSession(studentId);

    // When the student page renders.
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId, testId }),
    });
    render(ui);

    // Then a Start control is visible and the question is NOT shown.
    expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument();
    expect(screen.queryByText(/what is 2\+2/i)).not.toBeInTheDocument();
  });

  it("shows the questions and no Start control once a timed test has been started", async () => {
    // Given a timed test the student has already started.
    const { courseId, testId, studentId, s } = await seedTest(30);
    await s.testStartService.recordStart(testId, studentId, new Date());
    mockStudentSession(studentId);

    // When the student page renders.
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId, testId }),
    });
    render(ui);

    // Then the question is shown and no Start control is present.
    expect(screen.getByText(/what is 2\+2/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
  });

  it("renders a live countdown once a timed test has been started", async () => {
    // Given a timed test the student has already started.
    const { courseId, testId, studentId, s } = await seedTest(30);
    await s.testStartService.recordStart(testId, studentId, new Date());
    mockStudentSession(studentId);

    // When the student page renders.
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId, testId }),
    });
    render(ui);

    // Then a countdown is shown.
    expect(screen.getByText(/time remaining/i)).toBeInTheDocument();
  });

  it("shows the questions immediately with no Start control for an untimed test", async () => {
    // Given an untimed test (no time limit) the student has not started.
    const { courseId, testId, studentId } = await seedTest(null);
    mockStudentSession(studentId);

    // When the student page renders.
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId, testId }),
    });
    render(ui);

    // Then the question is shown straight away and no Start control appears.
    expect(screen.getByText(/what is 2\+2/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
  });
});
