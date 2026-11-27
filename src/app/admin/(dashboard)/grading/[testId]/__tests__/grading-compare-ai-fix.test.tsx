// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AI_GRADER_ID,
  AI_MODEL_NAME,
  type AiGradeSuggestionDocument,
} from "src/lib/ai-grade-types";
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
    gradeQuestionAction: vi.fn(),
    setTestFeedbackAction: vi.fn(),
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndJumpToNextAction: vi.fn(),
  }),
);

/** A submitted student with one written answer and an AI suggestion for it. */
async function seedSuggestedAnswer(
  db: Awaited<ReturnType<typeof setupTestDb>>["db"],
  solution: string | undefined,
) {
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
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Alpha question",
    content: "Alpha prompt",
    createdBy: "admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-ann",
    username: "ann",
    name: "Ann",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  const answer = await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "line one\nline two\nline three" },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  const suggestion: AiGradeSuggestionDocument = {
    id: "sugg-1",
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    score: 80,
    feedback: "close",
    ...(solution === undefined ? {} : { solution }),
    gradedAgainstAnswerId: answer.id,
    model: AI_MODEL_NAME,
    gradedBy: AI_GRADER_ID,
    generatedByAdminId: "admin",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    regenerateReason: null,
    appliedAt: null,
    appliedBy: null,
  };
  await db
    .collection<AiGradeSuggestionDocument>("ai_grade")
    .insertOne(suggestion);
  return { test, student };
}

async function openAnswer(testId: string, studentId: string) {
  const ui = await GradingVariantPage({
    params: Promise.resolve({ testId }),
    searchParams: Promise.resolve({ studentId }),
  });
  return render(ui);
}

describe("Feature: Compare with AI fix", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the student's answer and the AI's fixed answer side by side once the teacher opens the comparison", async () => {
    // Given: a written answer whose AI suggestion changes one of three lines
    const { test, student } = await seedSuggestedAnswer(
      db,
      "line one\nline 2\nline three",
    );
    await openAnswer(test.id, student.id);
    const pane = within(screen.getByTestId("grading-main-pane"));

    // When: the teacher opens "Compare with AI fix"
    await userEvent.click(
      pane.getByRole("button", { name: "Compare with AI fix" }),
    );

    // Then: both columns are titled and the number of differing lines shows
    expect(pane.getByText("Ann's answer")).toBeInTheDocument();
    expect(
      pane.getByText("AI suggested fix · not shown to Ann until you use it"),
    ).toBeInTheDocument();
    expect(pane.getByText("1 line differs")).toBeInTheDocument();
  });

  it("offers no comparison when the AI suggestion has no fixed answer", async () => {
    // Given: a suggestion saved before fixed answers existed
    const { test, student } = await seedSuggestedAnswer(db, undefined);

    // When: the teacher opens the answer
    await openAnswer(test.id, student.id);

    // Then: the answer shows and there is nothing to compare with
    const pane = within(screen.getByTestId("grading-main-pane"));
    expect(pane.getByText(/line one/)).toBeInTheDocument();
    expect(
      pane.queryByRole("button", { name: "Compare with AI fix" }),
    ).not.toBeInTheDocument();
  });
});
