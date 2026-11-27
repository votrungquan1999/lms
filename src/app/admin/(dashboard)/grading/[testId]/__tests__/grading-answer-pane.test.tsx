// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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

/** A submitted student whose first answer is graded and whose second is not. */
async function seedHalfGradedStudent() {
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
  await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Alpha question",
    content: "Alpha prompt",
    createdBy: "admin",
  });
  await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Beta question",
    content: "Beta prompt",
    createdBy: "admin",
  });
  const [q1, q2] = await services.questionService.listQuestions(test.id);
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
  for (const [q, text] of [
    [q1, "alpha answer"],
    [q2, "beta answer"],
  ] as const) {
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: { type: "free_text", text },
    });
  }
  await services.testSubmissionService.submitTest(test.id, student.id);
  await services.gradeService.gradeQuestion({
    testId: test.id,
    questionId: q1.id,
    studentId: student.id,
    score: 90,
    feedback: "ok",
    gradedBy: "admin",
  });
  return { test, student, q1, q2 };
}

describe("Feature: the left pane shows one question", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows only the chosen question with the student's answer, and without a choice opens the first answer that needs a grade", async () => {
    const { test, student, q1 } = await seedHalfGradedStudent();
    const open = async (questionId?: string) => {
      const ui = await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          studentId: student.id,
          ...(questionId ? { questionId } : {}),
        }),
      });
      return render(ui);
    };

    // When: the teacher opens the graded first question
    const chosen = await open(q1.id);

    // Then: that question and its answer show, and the other one does not
    let pane = within(screen.getByTestId("grading-main-pane"));
    expect(pane.getByText("Alpha prompt")).toBeInTheDocument();
    expect(pane.getByText("alpha answer")).toBeInTheDocument();
    expect(pane.queryByText("Beta prompt")).not.toBeInTheDocument();
    expect(pane.queryByText("beta answer")).not.toBeInTheDocument();
    chosen.unmount();

    // When: no question is chosen
    await open();

    // Then: the answer that still needs a grade opens
    pane = within(screen.getByTestId("grading-main-pane"));
    expect(pane.getByText("Beta prompt")).toBeInTheDocument();
    expect(pane.getByText("beta answer")).toBeInTheDocument();
    expect(pane.queryByText("alpha answer")).not.toBeInTheDocument();
  });

  it("counts the answer's lines and folds the model answer of a written question, saying whether students can see it", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const withheld = await services.testService.createTest(course.id, {
      title: "Withheld",
      description: "",
      createdBy: "admin",
      showCorrectAnswerAfterSubmit: false,
    });
    const shown = await services.testService.createTest(course.id, {
      title: "Shown",
      description: "",
      createdBy: "admin",
      showCorrectAnswerAfterSubmit: true,
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-bo",
      username: "bo",
      name: "Bo",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    const seed = async (testId: string, referenceAnswer?: string) => {
      await services.questionService.addQuestion(testId, {
        type: "free_text",
        title: "Solve",
        content: "Solve it",
        createdBy: "admin",
        ...(referenceAnswer ? { referenceAnswer } : {}),
      });
      const [q] = await services.questionService.listQuestions(testId);
      await services.answerService.submitAnswer({
        testId,
        questionId: (q as { id: string }).id,
        studentId: student.id,
        answer: { type: "free_text", text: "step one\nstep two\nstep three" },
      });
      await services.testSubmissionService.submitTest(testId, student.id);
    };
    await seed(withheld.id, "Use the quadratic formula");
    await seed(shown.id, "Use the quadratic formula");
    const open = async (testId: string) => {
      const ui = await GradingVariantPage({
        params: Promise.resolve({ testId }),
        searchParams: Promise.resolve({ studentId: student.id }),
      });
      return render(ui);
    };

    // When: the test whose correct answers are still hidden is opened
    const first = await open(withheld.id);

    // Then: the answer reads "3 lines" and the folded model answer says students do not see it yet
    expect(screen.getByTestId("answer-line-count")).toHaveTextContent(
      "3 lines",
    );
    const fold = screen.getByTestId("model-answer");
    expect(fold).toHaveTextContent("Use the quadratic formula");
    expect(fold).toHaveTextContent(
      "Model answer · students see it once correct answers are shown",
    );
    expect(fold).not.toHaveAttribute("open");
    first.unmount();

    // When: correct answers are shown on submit
    await open(shown.id);

    // Then: the fold says students can see it
    expect(screen.getByTestId("model-answer")).toHaveTextContent(
      "Model answer · students can see it",
    );
  });

  it("shows a choice answer read-only with the picked option marked wrong and the saved score, and no grade form", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Algebra",
      description: "",
      createdBy: "admin",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Choices",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      type: "single_select",
      title: "Pick one",
      content: "Pick the right one",
      createdBy: "admin",
      options: [
        { text: "Right option", isCorrect: true },
        { text: "Wrong option", isCorrect: false },
      ],
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-cy",
      username: "cy",
      name: "Cy",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    const wrong = (
      question as { options: { id: string; text: string }[] }
    ).options.find((o) => o.text === "Wrong option");
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [wrong?.id as string] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);

    // When: the teacher opens the answer
    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
      searchParams: Promise.resolve({ studentId: student.id }),
    });
    render(ui);

    // Then: the wrong pick shows as a wrong chip with the auto-graded score, and nothing is editable
    const pane = within(screen.getByTestId("grading-main-pane"));
    expect(pane.getByText("Wrong option")).toHaveAttribute(
      "data-state",
      "selected-wrong",
    );
    expect(pane.queryByText("Right option")).not.toBeInTheDocument();
    expect(pane.getByText("Score: 0")).toBeInTheDocument();
    expect(pane.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});
