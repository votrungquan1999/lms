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
import { saveAndNextAction } from "../../../courses/[courseId]/tests/[testId]/grading/actions";
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
    releaseGradesAction: vi.fn(),
    releaseCorrectAnswersAction: vi.fn(),
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
    saveAndNextAction: vi.fn(),
  }),
);

/** A test whose only student, Ana Cal, has saved one written answer and not handed in. */
async function seedStillWriting() {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Course",
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
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-ana",
    username: "ana",
    name: "Ana Cal",
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
    answer: { type: "free_text", text: "half-finished thought" },
  });
  return { test, student };
}

describe("Feature: a direct link to a still-writing student", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    vi.mocked(saveAndNextAction).mockClear();
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows her answers with the grade panel locked until the teacher presses Grade anyway, then saves her grade without asking again", async () => {
    // Given Ana Cal is still writing and the teacher follows a link straight to her
    const { test, student } = await seedStillWriting();

    // When the page opens
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({ studentId: student.id }),
      }),
    );

    // Then her saved answer is on screen
    expect(
      await screen.findByText(/half-finished thought/),
    ).toBeInTheDocument();
    // And the grade panel is locked: no score, no save, no overall feedback
    const panel = screen.getByTestId("grade-card");
    expect(within(panel).getByLabelText(/Score/)).toBeDisabled();
    expect(
      within(panel).getByRole("button", { name: /^Save & next/ }),
    ).toBeDisabled();
    expect(
      within(panel).getByLabelText("Overall Test Feedback:"),
    ).toBeDisabled();

    // When the teacher presses Grade anyway
    await userEvent.click(
      within(panel).getByRole("button", { name: "Grade anyway" }),
    );

    // Then the panel opens for grading
    expect(within(panel).getByLabelText(/Score/)).toBeEnabled();
    expect(
      within(panel).getByRole("button", { name: /^Save & next/ }),
    ).toBeEnabled();
    expect(
      within(panel).getByLabelText("Overall Test Feedback:"),
    ).toBeEnabled();

    // When the teacher scores her answer and presses Save & next
    await userEvent.type(within(panel).getByLabelText(/Score/), "80");
    await userEvent.click(
      within(panel).getByRole("button", { name: /^Save & next/ }),
    );

    // Then the grade saves straight away, with no second ask
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(saveAndNextAction).toHaveBeenCalledTimes(1);
  });

  it("opens the grade panel for a student the teacher confirmed in the picker", async () => {
    // Given the locked page for Ana Cal
    const { test, student } = await seedStillWriting();
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({ studentId: student.id }),
      }),
    );
    const panel = await screen.findByTestId("grade-card");
    expect(within(panel).getByLabelText(/Score/)).toBeDisabled();

    // When the teacher picks her in the picker and confirms Grade anyway
    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", {
        name: /Ana Cal/,
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Grade anyway",
      }),
    );

    // Then the panel is open without a second ask
    expect(within(panel).getByLabelText(/Score/)).toBeEnabled();
  });

  it("locks Use and Regenerate on the AI suggestion card until the teacher presses Grade anyway", async () => {
    // Given Ana Cal is still writing and her saved answer has an AI suggestion
    const { test, student } = await seedStillWriting();
    const [answer] = await getTestServices().answerService.getLatestAnswers(
      test.id,
      student.id,
    );
    await db.collection<AiGradeSuggestionDocument>("ai_grade").insertOne({
      id: "sugg-1",
      testId: test.id,
      questionId: answer?.questionId ?? "",
      studentId: student.id,
      score: 70,
      feedback: "AI feedback",
      gradedAgainstAnswerId: answer?.id ?? "",
      model: AI_MODEL_NAME,
      gradedBy: AI_GRADER_ID,
      generatedByAdminId: "admin-1",
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      regenerateReason: null,
      appliedAt: null,
      appliedBy: null,
    });

    // When the teacher follows a link straight to her
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({ studentId: student.id }),
      }),
    );

    // Then neither Use nor Regenerate can change her suggestion or grade yet
    const panel = await screen.findByTestId("grade-card");
    const use = within(panel).getByRole("button", { name: /^Use/ });
    expect(use).toBeDisabled();
    const regenerate = () =>
      within(panel).getByRole("button", { name: "Regenerate this answer" });
    expect(regenerate()).toBeDisabled();

    // When the teacher presses Grade anyway
    await userEvent.click(
      within(panel).getByRole("button", { name: "Grade anyway" }),
    );

    // Then both are offered
    expect(within(panel).getByRole("button", { name: /^Use/ })).toBeEnabled();
    expect(regenerate()).toBeEnabled();
  });

  it("keeps the AI card's read-only toggles usable while the grading controls stay locked", async () => {
    // Given Ana Cal is still writing and her answer has an older and a newer AI suggestion, the older with a fix
    const { test, student } = await seedStillWriting();
    const [answer] = await getTestServices().answerService.getLatestAnswers(
      test.id,
      student.id,
    );
    const suggestion = (
      id: string,
      generatedAt: string,
      solution?: string,
    ) => ({
      id,
      testId: test.id,
      questionId: answer?.questionId ?? "",
      studentId: student.id,
      score: 70,
      feedback: `feedback ${id}`,
      ...(solution ? { solution } : {}),
      gradedAgainstAnswerId: answer?.id ?? "",
      model: AI_MODEL_NAME,
      gradedBy: AI_GRADER_ID,
      generatedByAdminId: "admin-1",
      generatedAt: new Date(generatedAt),
      regenerateReason: null,
      appliedAt: null,
      appliedBy: null,
    });
    await db
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .insertMany([
        suggestion("older", "2026-01-01T00:00:00Z", "the older fix"),
        suggestion("newer", "2026-01-02T00:00:00Z"),
      ]);

    // When the teacher follows a link straight to her
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({ studentId: student.id }),
      }),
    );
    const panel = await screen.findByTestId("grade-card");

    // Then the history toggle works before Grade anyway
    const history = within(panel).getByRole("button", {
      name: /View history/,
    });
    expect(history).toBeEnabled();
    await userEvent.click(history);

    // And so does the older suggestion's fix toggle
    const showFix = within(panel).getByRole("button", {
      name: "Show suggested fix",
    });
    expect(showFix).toBeEnabled();
    await userEvent.click(showFix);
    expect(within(panel).getByText("the older fix")).toBeInTheDocument();

    // And the grading controls stay locked
    expect(within(panel).getByLabelText(/Score/)).toBeDisabled();
    for (const use of within(panel).getAllByTestId(
      "ai-suggestion-apply-button",
    ))
      expect(use).toBeDisabled();
  });
});
