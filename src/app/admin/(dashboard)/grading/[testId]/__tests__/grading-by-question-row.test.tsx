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

/** A one-question test with one student in each state the By question row shows. */
async function seedRow() {
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
  const make = async (key: string, name: string) => {
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
    return student;
  };
  const answer = (studentId: string) =>
    services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId,
      answer: { type: "free_text", text: `answer of ${studentId}` },
    });
  const handedIn = async (key: string, name: string) => {
    const student = await make(key, name);
    await answer(student.id);
    await services.testSubmissionService.submitTest(test.id, student.id);
    return student;
  };

  const ada = await handedIn("ada", "Ada Lovelace");
  await services.gradeService.gradeQuestion({
    testId: test.id,
    questionId: question.id,
    studentId: ada.id,
    score: 90,
    feedback: "good",
    gradedBy: "admin",
  });
  const ben = await handedIn("ben", "Ben Ng");
  const cy = await make("cy", "Cy Dee");
  await answer(cy.id);
  const di = await handedIn("di", "Di Eve");
  await services.redoRequestService.requestRedo(test.id, di.id, "admin");
  await make("eve", "Eve Fox");
  return { test, question, ada, ben, cy, di };
}

describe("Feature: the By question student row", () => {
  beforeEach(async () => {
    push.mockClear();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows one box per student with initials, coloured by state, ringing the first student who needs a grade", async () => {
    // Given a question with a graded, a waiting, a still-writing, a redo and a not-started student
    const { test, question, ada } = await seedRow();

    // When the teacher opens By question on it
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: question.id,
        }),
      }),
    );

    // Then there is one box per student who can be shown, in picker order (waiting before graded), with initials
    const row = screen.getByTestId("question-row");
    const boxes = within(row).getByTestId("question-row-boxes").children;
    expect(
      [...boxes].map((box) => [
        box.getAttribute("aria-label"),
        box.textContent,
      ]),
    ).toEqual([
      ["Ben Ng needs grading", "BN"],
      ["Ada Lovelace graded", "AL"],
      ["Cy Dee still writing", "CD"],
      ["Di Eve redo requested", "DE"],
    ]);
    // And the first student needing a grade is ringed
    expect(
      within(row).getByRole("link", { name: "Ben Ng needs grading" }),
    ).toHaveAttribute("aria-current", "true");
    // And graded students link to themselves on this question
    expect(
      within(row).getByRole("link", { name: "Ada Lovelace graded" }),
    ).toHaveAttribute("href", expect.stringContaining(`studentId=${ada.id}`));
    // And the students who have not started are counted, not boxed
    expect(within(row).getByText("1 not started")).toBeInTheDocument();
    // And the legend names this mode's states
    expect(within(row).getByTestId("question-row-legend")).toHaveTextContent(
      "Graded by you 1 · Needs grade 1 · Still writing 1 · Redo requested 1 · Blank 0",
    );
    // And a redo student's grey box cannot be clicked
    expect(
      within(row).queryByRole("link", { name: /Di Eve/ }),
    ).not.toBeInTheDocument();
  });

  it("asks before opening a still-writing student's box, and opens her only after Grade anyway", async () => {
    // Given the By question row with a still-writing student
    const { test, question, cy } = await seedRow();
    render(
      await GradingVariantPage({
        params: Promise.resolve({ testId: test.id }),
        searchParams: Promise.resolve({
          mode: "question",
          questionId: question.id,
        }),
      }),
    );
    const box = screen.getByRole("button", { name: "Cy Dee still writing" });

    // When the teacher presses her box and cancels
    await userEvent.click(box);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cy Dee is still writing. Grade anyway?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    // Then nothing opens
    expect(push).not.toHaveBeenCalled();

    // When she presses the box again and confirms
    await userEvent.click(box);
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Grade anyway",
      }),
    );

    // Then her answer to this question opens, still in By question
    expect(push).toHaveBeenCalledTimes(1);
    const opened = new URL(
      push.mock.calls[0]?.[0] as string,
      "http://lms.test",
    );
    expect(opened.searchParams.get("mode")).toBe("question");
    expect(opened.searchParams.get("studentId")).toBe(cy.id);
    expect(opened.searchParams.get("questionId")).toBe(question.id);
  });

  it("rings the student asked for, and falls back to the first student needing a grade on this question when the id is unknown", async () => {
    // Given Ben handed in first but is graded on Q1, Fay handed in next and waits on Q1, and Ada is fully graded
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
    const questions = [
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title: "Q1",
        content: "Q1",
        createdBy: "admin",
      }),
      await services.questionService.addQuestion(test.id, {
        type: "free_text",
        title: "Q2",
        content: "Q2",
        createdBy: "admin",
      }),
    ];
    const [q1] = questions;
    const handedIn = async (key: string, name: string, graded: string[]) => {
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
      for (const question of questions) {
        await services.answerService.submitAnswer({
          testId: test.id,
          questionId: question.id,
          studentId: student.id,
          answer: { type: "free_text", text: `${key} answer` },
        });
      }
      await services.testSubmissionService.submitTest(test.id, student.id);
      for (const questionId of graded) {
        await services.gradeService.gradeQuestion({
          testId: test.id,
          questionId,
          studentId: student.id,
          score: 90,
          feedback: "good",
          gradedBy: "admin",
        });
      }
      // Hand-ins must differ in time for "oldest first" to be decidable.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return student;
    };
    await handedIn("ben", "Ben Ng", [q1.id]);
    await handedIn("fay", "Fay Gu", []);
    const ada = await handedIn(
      "ada",
      "Ada Lovelace",
      questions.map((q) => q.id),
    );
    const open = async (studentId: string) =>
      render(
        await GradingVariantPage({
          params: Promise.resolve({ testId: test.id }),
          searchParams: Promise.resolve({
            mode: "question",
            questionId: q1.id,
            studentId,
          }),
        }),
      );

    // When the link names a student on the row
    const first = await open(ada.id);
    // Then her box is ringed
    expect(
      screen.getByRole("link", { name: "Ada Lovelace graded" }),
    ).toHaveAttribute("aria-current", "true");
    first.unmount();

    // When the link names nobody on the row
    await open("no-such-student");
    // Then Fay, not Ben in the first box, is ringed
    const boxes = screen.getByTestId("question-row-boxes").children;
    expect([...boxes].map((box) => box.getAttribute("aria-label"))).toEqual([
      "Ben Ng graded",
      "Fay Gu needs grading",
      "Ada Lovelace graded",
    ]);
    expect(
      screen.getByRole("link", { name: "Fay Gu needs grading" }),
    ).toHaveAttribute("aria-current", "true");
  });
});
