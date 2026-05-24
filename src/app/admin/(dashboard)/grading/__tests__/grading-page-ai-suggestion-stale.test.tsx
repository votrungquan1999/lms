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

describe("Feature: AI suggestion stale-badge after a redo cycle (Step 8)", () => {
  let currentDb: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await setupTestDb();
    currentDb = db;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("given a submitted test with one suggestion graded against the student's first answer, when the student is asked to redo, saves a new answer, and resubmits, then the grading page renders the suggestion row with data-stale=true", async () => {
    // Given: a course with one free-text question and one student.
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

    // Student saves their first free-text answer; capture its id.
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "v1" },
    });
    const latestAnswersV1 = await services.answerService.getLatestAnswers(
      test.id,
      student.id,
    );
    const answerV1 = latestAnswersV1.find((a) => a.questionId === q1.id);
    expect(answerV1).toBeDefined();
    const answerV1Id = answerV1?.id ?? "";

    // Student submits.
    await services.testSubmissionService.submitTest(test.id, student.id);

    // Seed an AI suggestion graded against the v1 answer. Direct insert keeps
    // the test decoupled from the LLM seam — same pattern Step 10 will use.
    const suggestionDoc: AiGradeSuggestionDocument = {
      id: "sugg-1",
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: 70,
      feedback: "graded against v1",
      gradedAgainstAnswerId: answerV1Id,
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

    // When: the redo flow runs — admin requests redo, student saves a new
    // answer (different content, so AnswerService inserts a new doc), the
    // previous submission is deleted, the student resubmits, and the redo
    // request is resolved.
    await services.redoRequestService.requestRedo(
      test.id,
      student.id,
      "admin-1",
    );
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "v2" },
    });
    await services.testSubmissionService.deleteSubmission(test.id, student.id);
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.redoRequestService.resolveRedoRequest(test.id, student.id);

    // Then: the grading page renders the suggestion with data-stale=true.
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
