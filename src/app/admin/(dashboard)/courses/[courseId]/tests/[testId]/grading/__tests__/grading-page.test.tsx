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
import GradingPage from "../page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(),
}));

vi.mock("../actions", () => ({
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  releaseCorrectAnswersAction: vi.fn(),
  requestRedoAction: vi.fn(),
  releaseGradeForStudentAction: vi.fn(),
  saveAndNextAction: vi.fn(),
}));

describe("Feature: GradingPage student picker", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should list a handed-in student under Needs grading in the student picker", async () => {
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
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q1",
      content: "Q1",
      createdBy: "admin",
    });
    const [q1] = await services.questionService.listQuestions(test.id);

    const submittedStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-s",
        username: "subs",
        name: "Subs",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      course.id,
      submittedStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: submittedStudent.id,
      answer: { type: "free_text", text: "answer" },
    });
    await services.testSubmissionService.submitTest(
      test.id,
      submittedStudent.id,
    );

    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    await userEvent.click(
      screen.getByRole("button", { name: /student picker/i }),
    );
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Needs grading · 1")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /Subs/ }),
    ).toBeInTheDocument();
  });

  it("when I land on the course-scoped grading page with a question link, I see the question I picked and the page is on the 'By question' tab", async () => {
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
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Explain Big-O",
      content: "Define O(n).",
      createdBy: "admin",
    });
    const [q] = await services.questionService.listQuestions(test.id);

    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
      searchParams: Promise.resolve({ mode: "question", questionId: q.id }),
    });
    render(ui);

    // Then: the pivot toggle reflects question mode.
    const byQuestion = screen.getByRole("tab", { name: /By question/i });
    expect(byQuestion.getAttribute("data-state")).toBe("active");

    // Then: the top bar's question picker names the question (proving the URL ->
    // shell selection wiring works on the course-scoped route too).
    expect(
      screen.getByRole("button", { name: /question picker/i }),
    ).toHaveTextContent("Q1 Explain Big-O");
  });
});
