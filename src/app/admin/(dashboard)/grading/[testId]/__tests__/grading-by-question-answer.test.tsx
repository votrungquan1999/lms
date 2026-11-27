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

const push = vi.hoisted(() => vi.fn());

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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

/** A two-question test with Ben and Cy handed in, in that order, and waiting on both. */
async function seedAnswers() {
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
  const [q1, q2] = [
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Count the vowels",
      content: "Count the vowels",
      createdBy: "admin",
    }),
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Reverse a string",
      content: "Reverse a string",
      createdBy: "admin",
    }),
  ];
  const handedIn = async (key: string, name: string) => {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${key}`,
      username: key,
      name,
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );
    for (const question of [q1, q2])
      await services.answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: student.id,
        answer: { type: "free_text", text: `${key} answers ${question.title}` },
      });
    await services.testSubmissionService.submitTest(test.id, student.id);
    return student;
  };
  const ben = await handedIn("ben", "Ben Ng");
  const cy = await handedIn("cy", "Cy Dee");
  return { test, q1, q2, ben, cy, handedIn };
}

/** A one-question test whose only student, Wren Writing, has saved an answer and not handed in. */
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
    authUserId: "auth-wren",
    username: "wren",
    name: "Wren Writing",
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
  return { test, question, student };
}

describe("Feature: the By question answer and grade panel", () => {
  beforeEach(async () => {
    push.mockClear();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows only the chosen student's answer with the same grade panel, and Save & next names who comes next on this question", async () => {
    // Given Ben and Cy both wait on Q1
    const { test, q1, ben } = await seedAnswers();

    // When the teacher opens Ben's answer to Q1 in By question
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: q1.id,
          studentId: ben.id,
        }),
      }),
    );

    // Then Ben's answer is on screen and Cy's is not
    const main = screen.getByTestId("grading-main-pane");
    expect(
      await within(main).findByText("ben answers Count the vowels"),
    ).toBeInTheDocument();
    expect(
      within(main).queryByText("cy answers Count the vowels"),
    ).not.toBeInTheDocument();

    // And the grade panel names the question and student and can save a score
    const panel = within(main).getByTestId("grade-card");
    expect(panel).toHaveTextContent("Grade · Q1 · Ben Ng");
    expect(within(panel).getByLabelText(/Score/)).toBeEnabled();

    // And Save & next says who is next on this question and how many are left
    expect(
      within(panel).getByRole("button", { name: "Save & next: Cy Dee" }),
    ).toBeEnabled();
    expect(panel).toHaveTextContent("2 answers left on Q1");
  });

  it("names the student whose box comes next on the row, oldest hand-in first", async () => {
    // Given Ben, Cy and then Di hand in, so the row reads Ben, Cy, Di
    const { test, q1, cy, handedIn } = await seedAnswers();
    await handedIn("di", "Di Eve");

    // When the teacher opens Cy's answer to Q1
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: q1.id,
          studentId: cy.id,
        }),
      }),
    );

    // Then the boxes and Save & next agree: Di comes after Cy
    const boxes = screen.getByTestId("question-row-boxes").children;
    expect([...boxes].map((box) => box.textContent)).toEqual([
      "BN",
      "CD",
      "DE",
    ]);
    const panel = await screen.findByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next: Di Eve" }),
    ).toBeEnabled();
  });

  it("locks the grade panel of a still-writing student until Grade anyway", async () => {
    // Given a still-writing student and a direct link to her answer in By question
    const { test, question, student } = await seedStillWriting();
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: question.id,
          studentId: student.id,
        }),
      }),
    );

    // Then her saved answer shows and the grade panel is locked
    const panel = await screen.findByTestId("grade-card");
    expect(screen.getByText(/half-finished thought/)).toBeInTheDocument();
    const save = () =>
      within(panel).getByRole("button", { name: /^Save & next/ });
    const overall = () =>
      within(panel).getByLabelText("Overall Test Feedback:");
    expect(within(panel).getByLabelText(/Score/)).toBeDisabled();
    expect(save()).toBeDisabled();
    expect(overall()).toBeDisabled();

    // When the teacher presses Grade anyway
    await userEvent.click(
      within(panel).getByRole("button", { name: "Grade anyway" }),
    );

    // Then the panel opens for grading
    expect(within(panel).getByLabelText(/Score/)).toBeEnabled();
    expect(save()).toBeEnabled();
    expect(overall()).toBeEnabled();
  });

  it("names the next question on Save & next when this is the last answer to grade on the question", async () => {
    // Given Cy is already graded on Q1, so Ben holds its last waiting answer
    const { test, q1, ben, cy } = await seedAnswers();
    await getTestServices().gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: cy.id,
      score: 80,
      feedback: "ok",
      gradedBy: "admin",
    });

    // When the teacher opens Ben's answer to Q1
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: q1.id,
          studentId: ben.id,
        }),
      }),
    );

    // Then Save & next points at the next question
    const panel = await screen.findByTestId("grade-card");
    expect(
      within(panel).getByRole("button", { name: "Save & next: Q2" }),
    ).toBeEnabled();
    expect(panel).toHaveTextContent("Last Q1 answer to grade");
  });
});
