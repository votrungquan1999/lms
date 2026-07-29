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
 * Seeds a course + practice test + 1 free_text question + 1 enrolled
 * student. No referenceAnswer/explanation authored — this scenario is about
 * the resubmit/finalize interaction loop, not the reveal card content.
 */
async function seedPracticeFreeTextFinalizeScenario() {
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
    content: "Explain photosynthesis",
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
  return { services, course, test, question, student };
}

/**
 * Seeds a course + practice test + 1 single_select MC question + 1 enrolled
 * student, for the MC-inclusive finalize scenario (unblocked by Step 16's
 * `!isPractice` gate on autoGradeTest).
 */
async function seedPracticeMcFinalizeScenario() {
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

describe("Feature: Student test page — practice revise/resubmit coexists with whole-test finalize", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("lets the student resubmit a different free_text answer before finalizing, with the whole-test Submit still available", async () => {
    const { services, course, test, question, student } =
      await seedPracticeFreeTextFinalizeScenario();

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "first answer" },
    });
    // Revise — a genuinely different answer (an identical resubmit throws).
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "second, revised answer" },
    });

    const latest = await services.answerService.getLatestAnswers(
      test.id,
      student.id,
    );
    expect(latest).toHaveLength(1);
    expect(latest[0].answer).toEqual({
      type: "free_text",
      text: "second, revised answer",
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Whole-test finalize remains available (D4) — resubmitting doesn't
    // consume or hide the Submit control.
    expect(
      screen.getByRole("button", { name: "Submit Test for Grading" }),
    ).toBeInTheDocument();
  });

  it("locks further editing once the practice test is finalized, same as a normal test", async () => {
    const { services, course, test, question, student } =
      await seedPracticeFreeTextFinalizeScenario();

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // canAnswer flips false post-finalize — no whole-test Submit control and
    // no "Edit Answer" retry affordance should render.
    expect(
      screen.queryByRole("button", { name: "Submit Test for Grading" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Answer" })).toBeNull();
  });

  it("finalizing a practice test with an MC question creates no grade, and the reveal card (not a grade badge) is shown post-finalize", async () => {
    const {
      services,
      course,
      test,
      question,
      correctOption,
      wrongOption,
      student,
    } = await seedPracticeMcFinalizeScenario();

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption.id] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    const grades = await services.gradeService.getGrades(test.id, student.id);
    expect(grades).toHaveLength(0);

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // The practice reveal chip is still shown (Card branch, not GradedQuestion) …
    expect(
      screen.getByTestId(`mc-chip-${correctOption.id}`),
    ).toBeInTheDocument();
    // … and no numeric score badge (GradedQuestion's "N/100") ever renders,
    // since no Grade doc was ever created (D2/D9).
    expect(screen.queryByText(/\/100/)).toBeNull();
  });
});
