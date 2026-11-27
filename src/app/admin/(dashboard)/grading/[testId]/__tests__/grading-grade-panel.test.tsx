// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** A submitted student with a written answer to each of two questions. */
async function seedTwoAnswers() {
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
  const q1 = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Alpha question",
    content: "Alpha prompt",
    createdBy: "admin",
  });
  const q2 = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Beta question",
    content: "Beta prompt",
    createdBy: "admin",
  });
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
  return { services, test, student, q1, q2 };
}

async function pageFor(testId: string, studentId: string, questionId: string) {
  return GradingVariantPage({
    params: Promise.resolve({ testId }),
    searchParams: Promise.resolve({ studentId, questionId }),
  });
}

describe("Feature: the grade panel", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("names the question and the student, and the quick 0, 50 and 100 buttons fill the score", async () => {
    const { test, student, q1 } = await seedTwoAnswers();

    // When: the teacher opens the first answer
    render(await pageFor(test.id, student.id, q1.id));

    // Then: the panel header names the question number and the student
    const panel = within(screen.getByTestId("grade-card"));
    expect(panel.getByText("Grade · Q1 · Olive")).toBeInTheDocument();
    expect(panel.getByText("Alpha question · @olive")).toBeInTheDocument();

    // When: the teacher clicks the quick 50 button
    await userEvent.click(panel.getByRole("button", { name: "50" }));

    // Then: the score field holds 50
    expect(panel.getByRole("spinbutton", { name: /score/i })).toHaveValue(50);
  });

  it("carries none of the draft to the next answer when neither answer has a grade yet", async () => {
    const { test, student, q1, q2 } = await seedTwoAnswers();

    // Given: the teacher has picked a score and typed feedback on the first answer
    const view = render(await pageFor(test.id, student.id, q1.id));
    const first = within(screen.getByTestId("grade-card"));
    await userEvent.click(first.getByRole("button", { name: "50" }));
    await userEvent.type(
      first.getByRole("textbox", { name: "Feedback:" }),
      "my draft",
    );

    // When: the teacher moves to the second answer on the same screen
    view.rerender(await pageFor(test.id, student.id, q2.id));

    // Then: the second answer's form is empty
    const panel = within(screen.getByTestId("grade-card"));
    expect(panel.getByRole("spinbutton", { name: /score/i })).toHaveValue(null);
    expect(panel.getByRole("textbox", { name: "Feedback:" })).toHaveValue("");
  });

  it("starts the form fresh for each answer, showing that answer's saved grade and none of the draft typed on the previous one", async () => {
    const { services, test, student, q1, q2 } = await seedTwoAnswers();
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q2.id,
      studentId: student.id,
      score: 70,
      feedback: "Beta saved feedback",
      gradedBy: "admin",
    });

    // Given: the teacher has typed a draft on the first answer
    const view = render(await pageFor(test.id, student.id, q1.id));
    await userEvent.type(
      within(screen.getByTestId("grade-card")).getByRole("textbox", {
        name: "Feedback:",
      }),
      "my draft",
    );

    // When: the teacher moves to the second answer on the same screen
    view.rerender(await pageFor(test.id, student.id, q2.id));

    // Then: the form shows the second answer's saved grade, not the draft
    const panel = within(screen.getByTestId("grade-card"));
    expect(panel.getByRole("spinbutton", { name: /score/i })).toHaveValue(70);
    expect(panel.getByRole("textbox", { name: "Feedback:" })).toHaveValue(
      "Beta saved feedback",
    );
  });
});

describe("Feature: overall feedback in the grade panel", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("folds the student's overall feedback under a row that names her, and opens it onto the saved text", async () => {
    const { services, test, student, q1 } = await seedTwoAnswers();
    await services.testFeedbackService.setTestFeedback({
      testId: test.id,
      studentId: student.id,
      feedback: "Well done overall",
      gradedBy: "admin",
    });

    // When: the teacher opens one of her answers
    render(await pageFor(test.id, student.id, q1.id));

    // Then: the row is folded and names the student
    const row = screen
      .getByText("Overall feedback for Olive")
      .closest("details");
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("open");

    // When: the teacher opens the row
    await userEvent.click(screen.getByText("Overall feedback for Olive"));

    // Then: the form holds the saved feedback
    expect(
      within(row as HTMLElement).getByRole("textbox", { name: /overall/i }),
    ).toHaveValue("Well done overall");
  });

  it("carries none of one student's typed overall feedback to the next student", async () => {
    const { services, test, student, q1 } = await seedTwoAnswers();
    const pia = await services.studentService.createStudentDocument({
      authUserId: "auth-pia",
      username: "pia",
      name: "Pia",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      test.courseId,
      pia.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: pia.id,
      answer: { type: "free_text", text: "pia answer" },
    });
    await services.testSubmissionService.submitTest(test.id, pia.id);
    await services.testFeedbackService.setTestFeedback({
      testId: test.id,
      studentId: pia.id,
      feedback: "Pia saved feedback",
      gradedBy: "admin",
    });

    // Given: the teacher has typed overall feedback for Olive without saving
    const view = render(await pageFor(test.id, student.id, q1.id));
    await userEvent.click(screen.getByText("Overall feedback for Olive"));
    await userEvent.type(
      screen.getByRole("textbox", { name: /overall/i }),
      "draft for Olive",
    );

    // When: the teacher moves to Pia on the same screen
    view.rerender(await pageFor(test.id, pia.id, q1.id));

    // Then: Pia's row shows her saved feedback, not Olive's draft
    await userEvent.click(screen.getByText("Overall feedback for Pia"));
    expect(screen.getByRole("textbox", { name: /overall/i })).toHaveValue(
      "Pia saved feedback",
    );
  });
});
