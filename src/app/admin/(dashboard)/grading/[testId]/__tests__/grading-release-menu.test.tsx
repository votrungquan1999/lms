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

interface SeedOptions {
  showGradeAfterSubmit?: boolean;
  showCorrectAnswerAfterSubmit?: boolean;
  /** How many of the two submitted students get a grade. */
  graded: number;
}

/** A test with two students who handed in, `graded` of them graded; returns the test and the students. */
async function seedTest(options: SeedOptions) {
  const services = getTestServices();
  const course = await services.courseService.createCourse({
    title: "Algebra 101",
    description: "",
    createdBy: "admin",
  });
  const test = await services.testService.createTest(course.id, {
    title: "Midterm",
    description: "",
    createdBy: "admin",
    showGradeAfterSubmit: options.showGradeAfterSubmit ?? false,
    showCorrectAnswerAfterSubmit: options.showCorrectAnswerAfterSubmit ?? false,
  });
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Q1",
    createdBy: "admin",
  });
  const students = [];
  for (const name of ["Alice", "Bob"]) {
    const student = await services.studentService.createStudentDocument({
      authUserId: `auth-${name}`,
      username: name.toLowerCase(),
      name,
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
      answer: { type: "free_text", text: `${name}'s answer` },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    students.push(student);
  }
  for (const student of students.slice(0, options.graded)) {
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 90,
      feedback: "ok",
      gradedBy: "admin",
    });
  }
  return { test, students };
}

async function renderPage(testId: string) {
  render(await GradingVariantPage({ params: Promise.resolve({ testId }) }));
}

describe("Feature: the Release ▾ chip in the grading top bar", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("reads Not released while graded students cannot see their grades yet", async () => {
    const { test } = await seedTest({ graded: 2 });

    await renderPage(test.id);

    expect(screen.getByTestId("release-state")).toHaveTextContent(
      "Not released",
    );
  });

  it("reads Released to 1 of 2 once one of two graded students was released on her own", async () => {
    const { test, students } = await seedTest({ graded: 2 });
    await getTestServices().testSubmissionService.releaseGradeToStudent(
      test.id,
      students[0].id,
      "admin",
    );

    await renderPage(test.id);

    expect(screen.getByTestId("release-state")).toHaveTextContent(
      "Released to 1 of 2",
    );
  });

  it("reads Released after the whole test's grades were released", async () => {
    const { test } = await seedTest({ graded: 2 });
    await getTestServices().testService.releaseGrades(test.id, "admin");

    await renderPage(test.id);

    expect(screen.getByTestId("release-state")).toHaveTextContent(/^Released$/);
  });

  it("reads Shown on submit when grades show as soon as a student hands in", async () => {
    const { test } = await seedTest({ graded: 2, showGradeAfterSubmit: true });

    await renderPage(test.id);

    expect(screen.getByTestId("release-state")).toHaveTextContent(
      "Shown on submit",
    );
  });

  it("offers only Release correct answers, under a note that grades are out for the whole test, once the whole test's grades were released", async () => {
    const { test } = await seedTest({ graded: 2 });
    await getTestServices().testService.releaseGrades(test.id, "admin");
    await renderPage(test.id);

    await userEvent.click(
      screen.getByRole("button", { name: /^Release .+▾$/ }),
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByText("Grades released for the whole test"),
    ).toBeInTheDocument();
    expect(
      within(menu).getByText("Students graded later see theirs right away."),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /release correct answers/i }),
    ).toHaveTextContent("Students see the right answer to each question");
    expect(
      within(menu).queryByRole("menuitem", { name: /release grades/i }),
    ).not.toBeInTheDocument();
  });

  it("offers only Release correct answers on a Shown on submit test while they are hidden", async () => {
    const { test } = await seedTest({ graded: 2, showGradeAfterSubmit: true });
    await renderPage(test.id);

    await userEvent.click(
      screen.getByRole("button", { name: /^Release .+▾$/ }),
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining("Release correct answers")]);
  });

  it("still offers Release grades… and Release correct answers after a release to chosen students", async () => {
    const { test, students } = await seedTest({ graded: 2 });
    await getTestServices().testSubmissionService.releaseGradeToStudent(
      test.id,
      students[0].id,
      "admin",
    );
    await renderPage(test.id);

    await userEvent.click(
      screen.getByRole("button", { name: /^Release .+▾$/ }),
    );

    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /release grades/i }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /release correct answers/i }),
    ).toBeInTheDocument();
  });
});
