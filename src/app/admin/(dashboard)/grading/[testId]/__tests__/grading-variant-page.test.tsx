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
    requestRedoAction: vi.fn(),
    releaseGradeForStudentAction: vi.fn(),
  }),
);

describe("Feature: GradingVariantPage", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the test title and course title in the header, plus a status-sorted student card", async () => {
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
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q",
    });
    const [q] = await services.questionService.listQuestions(test.id);

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
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q.id,
      studentId: student.id,
      answer: { type: "free_text", text: "x" },
    });

    const ui = await GradingVariantPage({
      params: Promise.resolve({ testId: test.id }),
    });
    render(ui);

    // Header shows test + course title
    expect(
      screen.getByRole("heading", { name: /Midterm/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Algebra 101/)).toBeInTheDocument();

    // Body renders the student card (proves shared body composes correctly)
    expect(
      screen.getByTestId(`student-card-${student.id}`),
    ).toBeInTheDocument();

    // Status badge is present (Submitted)
    const card = screen.getByTestId(`student-card-${student.id}`);
    const badge = card.querySelector("[data-status]");
    expect(badge?.getAttribute("data-status")).toBe("submitted");
  });
});
