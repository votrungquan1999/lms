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

describe("Feature: Auto-grade with AI button visibility on the admin grading page", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should render the Auto-grade with AI button only on the Submitted student card, hiding it on NotStarted, InProgress, and Graded cards", async () => {
    // Given: a single test with 4 students, one in each TestStatus
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
    // Two free-text questions so that InProgress (one answer, no submit) is
    // distinguishable from Submitted (both answers OR submit flag).
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin",
      type: "free_text",
    });
    const q2 = await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Explain again",
      createdBy: "admin",
      type: "free_text",
    });

    // Student 1 — NotStarted (no answers, no submission).
    const notStartedStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-notstarted",
        username: "notstarted-user",
        name: "NotStarted Nina",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      course.id,
      notStartedStudent.id,
      "admin",
    );

    // Student 2 — InProgress (one answer, no submit).
    const inProgressStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-inprogress",
        username: "inprogress-user",
        name: "InProgress Iggy",
        createdBy: "admin",
      });
    await services.enrollmentService.enrollStudent(
      course.id,
      inProgressStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: inProgressStudent.id,
      answer: { type: "free_text", text: "partial answer" },
    });

    // Student 3 — Submitted (both answers + explicit submit, no grades).
    const submittedStudent =
      await services.studentService.createStudentDocument({
        authUserId: "auth-submitted",
        username: "submitted-user",
        name: "Submitted Sam",
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
      answer: { type: "free_text", text: "ans 1" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: submittedStudent.id,
      answer: { type: "free_text", text: "ans 2" },
    });
    await services.testSubmissionService.submitTest(
      test.id,
      submittedStudent.id,
    );

    // Student 4 — Graded (both questions graded).
    const gradedStudent = await services.studentService.createStudentDocument({
      authUserId: "auth-graded",
      username: "graded-user",
      name: "Graded Greg",
      createdBy: "admin",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      gradedStudent.id,
      "admin",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: gradedStudent.id,
      answer: { type: "free_text", text: "g1" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: gradedStudent.id,
      answer: { type: "free_text", text: "g2" },
    });
    await services.testSubmissionService.submitTest(test.id, gradedStudent.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: gradedStudent.id,
      score: 100,
      feedback: "ok",
      gradedBy: "admin",
    });
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q2.id,
      studentId: gradedStudent.id,
      score: 100,
      feedback: "ok",
      gradedBy: "admin",
    });

    // When: the grading page renders
    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: only the Submitted card shows the Auto-grade with AI button
    const submittedCard = await screen.findByTestId(
      `student-card-${submittedStudent.id}`,
    );
    expect(
      within(submittedCard).getByRole("button", {
        name: /auto-grade with ai/i,
      }),
    ).toBeInTheDocument();

    const notStartedCard = screen.getByTestId(
      `student-card-${notStartedStudent.id}`,
    );
    expect(
      within(notStartedCard).queryByRole("button", {
        name: /auto-grade with ai/i,
      }),
    ).toBeNull();

    const inProgressCard = screen.getByTestId(
      `student-card-${inProgressStudent.id}`,
    );
    expect(
      within(inProgressCard).queryByRole("button", {
        name: /auto-grade with ai/i,
      }),
    ).toBeNull();

    const gradedCard = screen.getByTestId(`student-card-${gradedStudent.id}`);
    expect(
      within(gradedCard).queryByRole("button", {
        name: /auto-grade with ai/i,
      }),
    ).toBeNull();
  });
});
