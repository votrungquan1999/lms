// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingVariantPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions",
  () => ({
    setTestFeedbackAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

/** A student who handed in a test with one question in each state the row can show. */
async function seedOneOfEachState() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Algebra",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Midterm",
    description: "",
    createdBy: "admin",
  });
  const choice = (title: string) =>
    services.questionService.addQuestion(test.id, {
      type: "single_select",
      title,
      content: "",
      createdBy: "admin",
      options: [
        { text: "One", isCorrect: true },
        { text: "Two", isCorrect: false },
      ],
    });
  const written = (title: string) =>
    services.questionService.addQuestion(test.id, {
      type: "free_text",
      title,
      content: "",
      createdBy: "admin",
    });
  const q1 = await choice("Right choice");
  const q2 = await choice("Half choice");
  const q3 = await choice("Wrong choice");
  const q4 = await written("Graded written");
  const q5 = await written("Waiting written");
  const q6 = await written("Left blank");
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-olive",
    username: "olive",
    name: "Olive",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  for (const q of [q1, q2, q3]) {
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [q.options?.[0]?.id ?? ""] },
    });
  }
  for (const q of [q4, q5]) {
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: { type: "free_text", text: "an answer" },
    });
  }
  await services.testSubmissionService.submitTest(test.id, student.id);
  for (const [q, score] of [
    [q1, 100],
    [q2, 50],
    [q3, 0],
    [q4, 80],
  ] as const) {
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      score,
      feedback: "",
      gradedBy: "admin",
    });
  }
  return { test, student, questions: [q1, q2, q3, q4, q5, q6] };
}

describe("Feature: the question number row", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows one box per question in its state for this student, rings the current one and links each to its question", async () => {
    const { test, student, questions } = await seedOneOfEachState();
    const [q1, , , , q5] = questions;

    // When: the teacher opens the fifth answer
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          studentId: student.id,
          questionId: q5.id,
        }),
      }),
    );

    // Then: each box carries its question number and state
    for (const name of [
      "Q1 correct",
      "Q2 partly right",
      "Q3 wrong",
      "Q4 graded",
      "Q5 needs grading",
      "Q6 blank",
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    // And: the current box is marked and every box opens its own question
    expect(
      screen.getByRole("link", { name: "Q5 needs grading" }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Q1 correct" })).toHaveAttribute(
      "href",
      expect.stringContaining(`questionId=${q1.id}`),
    );
    // And: the legend counts each state
    expect(screen.getByTestId("question-row-legend")).toHaveTextContent(
      "Correct 1 · Wrong 1 · Partly right 1 · Graded by you 1 · Needs grade 1 · Blank 1",
    );
  });
});
