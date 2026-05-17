// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
  gradeQuestionAction: vi.fn(),
  setTestFeedbackAction: vi.fn(),
  releaseGradesAction: vi.fn(),
  requestRedoAction: vi.fn(),
  releaseGradeForStudentAction: vi.fn(),
}));

describe("Feature: GradingPage student card ordering", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("should sort student cards Submitted -> InProgress -> NotStarted -> Graded with enrollment order as tiebreaker", async () => {
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
    });
    await services.questionService.addQuestion(test.id, {
      type: "free_text",
      title: "Q2",
    });
    const questions = await services.questionService.listQuestions(test.id);
    const [q1, q2] = questions;

    // Create + enroll 5 students sequentially: A, B, C, D, E.
    // listEnrollmentsByCourse sorts by enrolledAt desc, so the natural
    // page order is the reverse: E, D, C, B, A.
    // A (NotStarted), B (Submitted), C (InProgress), D (Graded), E (NotStarted).
    // Expected sort: B (Submitted) -> C (InProgress) -> E,A (NotStarted, preserving the data-fetch order which is enrollment-desc) -> D (Graded).
    const studentIds: Record<string, string> = {};
    for (const [key, name] of [
      ["A", "Alice"],
      ["B", "Bob"],
      ["C", "Carol"],
      ["D", "Dan"],
      ["E", "Eve"],
    ] as const) {
      const s = await services.studentService.createStudentDocument({
        authUserId: `auth-${key}`,
        username: key.toLowerCase(),
        name,
        createdBy: "admin",
      });
      studentIds[key] = s.id;
      await services.enrollmentService.enrollStudent(course.id, s.id, "admin");
    }

    // Bob: Submitted (both answered)
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: studentIds.B,
      answer: { type: "free_text", text: "B1" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: studentIds.B,
      answer: { type: "free_text", text: "B2" },
    });

    // Carol: InProgress (one answered)
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: studentIds.C,
      answer: { type: "free_text", text: "C1" },
    });

    // Dan: Graded (both answered + both graded)
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: studentIds.D,
      answer: { type: "free_text", text: "D1" },
    });
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q2.id,
      studentId: studentIds.D,
      answer: { type: "free_text", text: "D2" },
    });
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q1.id,
      studentId: studentIds.D,
      score: 100,
      feedback: "",
      gradedBy: "admin",
    });
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: q2.id,
      studentId: studentIds.D,
      score: 90,
      feedback: "",
      gradedBy: "admin",
    });

    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });

    render(ui);

    const cards = screen.getAllByTestId(/^student-card-/);
    const orderedNames = cards.map((el) =>
      el.getAttribute("data-student-name"),
    );
    expect(orderedNames).toEqual(["Bob", "Carol", "Eve", "Alice", "Dan"]);
  });

  it("should render a status badge in the header of each student card", async () => {
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

    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const card = screen.getByTestId(`student-card-${submittedStudent.id}`);
    const badge = card.querySelector("[data-status]");
    expect(badge?.getAttribute("data-status")).toBe("submitted");
    expect(badge?.textContent).toContain("Submitted");
  });
});
