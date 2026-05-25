// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { AiGradeSuggestionDocument } from "src/lib/ai-grade-types";
import { AI_GRADER_ID, AI_MODEL_NAME } from "src/lib/ai-grade-types";
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

describe("Feature: AI suggestion stale-badge", () => {
  let currentDb: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await setupTestDb();
    currentDb = db;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("renders the suggestion row with data-stale=true when the stored suggestion's gradedAgainstAnswerId does not match the current latest answer id", async () => {
    // Minimum setup: one course/test/question/student with a single saved
    // answer (the "latest"), plus an AI suggestion seeded directly against a
    // *different* answer id. The grading page computes staleness read-time by
    // comparing `suggestion.gradedAgainstAnswerId` with the latest answer's
    // id, so we don't need to run a real redo flow to reach the stale state.
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin-1",
    });
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin-1",
      showGradeAfterSubmit: false,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Q1",
      content: "Explain",
      createdBy: "admin-1",
      type: "free_text",
    });
    const student = await services.studentService.createStudentDocument({
      authUserId: "auth-1",
      username: "u1",
      name: "Stu",
      createdBy: "admin-1",
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin-1",
    );

    // Save the current latest answer.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "current" },
    });

    // Seed a suggestion graded against a *different* (non-existent) answer id
    // so the read-time comparison flags it as stale.
    const suggestionDoc: AiGradeSuggestionDocument = {
      id: "sugg-1",
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 70,
      feedback: "graded against an older answer",
      gradedAgainstAnswerId: "stale-answer-id",
      model: AI_MODEL_NAME,
      gradedBy: AI_GRADER_ID,
      generatedByAdminId: "admin-1",
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      regenerateReason: null,
      appliedAt: null,
      appliedBy: null,
    };
    await currentDb
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .insertOne(suggestionDoc);

    const ui = await GradingPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    const studentCard = await screen.findByTestId(`student-card-${student.id}`);
    const suggestionRow = within(studentCard).getByTestId("ai-suggestion-row");
    expect(suggestionRow.getAttribute("data-suggestion-id")).toBe("sugg-1");
    expect(suggestionRow.getAttribute("data-stale")).toBe("true");
    expect(
      within(suggestionRow).getByTestId("ai-suggestion-stale-badge"),
    ).toHaveTextContent(/stale/i);
  });
});
