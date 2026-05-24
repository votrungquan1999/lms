// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GradingPage from "../../courses/[courseId]/tests/[testId]/grading/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Map()),
  cookies: vi.fn(),
}));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn().mockResolvedValue({
    requireAdminSession: vi.fn().mockResolvedValue({ userId: "admin-1" }),
  }),
}));

describe("Feature: Admin grading hub treats a submitted test with one blank question as fully graded once the answered question is graded", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the student card with a '1/1 graded' badge denominator AND the Graded status badge when the student answered only Q1, submitted, and the teacher graded Q1", async () => {
    // Given: a 2-question test, one student who answered Q1 only (Q2
    // blank), submitted the test, and the teacher graded Q1.
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
      showGradeAfterSubmit: false,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Answered question",
      createdBy: "admin",
      type: "free_text",
    });
    await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Blank question",
      createdBy: "admin",
      type: "free_text",
    });

    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-blank",
      username: "blank-user",
      name: "Blank Bea",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin",
    );

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "I answered Q1" },
    });
    // Q2 deliberately left blank — no submitAnswer.
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 100,
      feedback: "ok",
      gradedBy: "admin",
    });

    // When: the admin grading page renders.
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: the student card uses the answered-question count as the
    // badge denominator (1/1, not 1/2), and the status badge reads
    // "Graded" — proving Step 1's TestStatusService change + Step 6's
    // denominator change both took effect end-to-end through the UI.
    const card = await screen.findByTestId(`student-card-${student.id}`);
    expect(within(card).getByText("1/1 graded")).toBeInTheDocument();
    expect(within(card).getByText("Graded")).toBeInTheDocument();
  });
});
