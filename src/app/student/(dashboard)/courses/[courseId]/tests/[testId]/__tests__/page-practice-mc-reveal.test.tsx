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

// Same auth-singleton mock plumbing as page.test.tsx / page-practice-reveal.test.tsx.
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
 * Seeds a course + practice test + 2 single_select MC questions (each with
 * a correct/wrong option pair) + 1 enrolled student. Two questions let tests
 * distinguish a per-question reveal gate from a per-test one (Step 12).
 */
async function seedPracticeMcScenario() {
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
  const question1 = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Pick one",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "A (correct)", isCorrect: true },
      { text: "B (wrong)", isCorrect: false },
    ],
  });
  const question2 = await services.questionService.addQuestion(test.id, {
    title: "Q2",
    content: "Pick one",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "C (correct)", isCorrect: true },
      { text: "D (wrong)", isCorrect: false },
    ],
  });
  const [correctOption1, wrongOption1] = question1.options as McOption[];
  const [correctOption2, wrongOption2] = question2.options as McOption[];

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
    question1,
    question2,
    correctOption1,
    wrongOption1,
    correctOption2,
    wrongOption2,
    student,
  };
}

describe("Feature: Student test page — practice-mode reveal (MC, per-question)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("reveals whether the MC answer was correct right after submitting that question, while the whole test stays unsubmitted", async () => {
    const {
      services,
      course,
      test,
      question1,
      correctOption1,
      wrongOption1,
      student,
    } = await seedPracticeMcScenario();

    // Submit only this question's answer — no whole-test finalize.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question1.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption1.id] },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // The missed-correct chip must be visible immediately — no whole-test
    // submit occurred, so this proves the reveal is per-question, not gated
    // on isSubmitted.
    expect(
      screen.getByTestId(`mc-chip-${correctOption1.id}`),
    ).toBeInTheDocument();
    // The whole-test Submit control must still be present (D4) — finalize
    // stays optional, this isn't tested exhaustively here (Step 14's job),
    // just confirmed as a sanity check that we're in the pre-finalize state.
    expect(
      screen.getByRole("button", { name: "Submit Test for Grading" }),
    ).toBeInTheDocument();
  });

  it("never reveals MC correctness for a practice question before the student answers it, even when a sibling question in the same test is already revealed", async () => {
    const {
      services,
      course,
      test,
      question1,
      correctOption1,
      wrongOption1,
      correctOption2,
      student,
    } = await seedPracticeMcScenario();

    // Answer only Q1 — Q2 is deliberately left unanswered.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question1.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrongOption1.id] },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Q1 is answered — its reveal is open (proven above in Step 11's test;
    // re-asserted here to prove this is a per-question gate, not per-test).
    expect(
      screen.getByTestId(`mc-chip-${correctOption1.id}`),
    ).toBeInTheDocument();
    // Q2 is unanswered — no chip claiming its correctness may render.
    expect(screen.queryByTestId(`mc-chip-${correctOption2.id}`)).toBeNull();
  });
});
