// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AiGradeSuggestionDocument } from "src/lib/ai-grade-types";
import { AI_GRADER_ID, AI_MODEL_NAME } from "src/lib/ai-grade-types";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

// ── Auth-singleton + Next mocks (mirror page.test.tsx) ──────────────────────
const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
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
    getSession: (...args: unknown[]) => mockGetSession(...args),
    requireStudentSession: (...args: unknown[]) =>
      mockRequireStudentSession(...args),
  }),
}));

/**
 * Configures the auth mock to return a student session for the given id.
 */
function mockStudentSession(studentId: string) {
  const session = {
    role: "student" as const,
    userId: `auth-${studentId}`,
    username: `u-${studentId}`,
    studentId,
  };
  mockGetSession.mockResolvedValue(session);
  mockRequireStudentSession.mockResolvedValue(session);
}

// Sentinels chosen to be unique and never produced by surrounding copy.
// If a future refactor leaks suggestion contents to the student page, these
// strings will appear in the rendered DOM and the negative assertions will
// fail loudly.
const AI_FEEDBACK_SENTINEL = "AI_SUGGESTION_FEEDBACK_DO_NOT_SHOW";
const AI_SCORE_SENTINEL = 73;

describe("Feature: Student test page — AI suggestions are isolated (Step 10)", () => {
  let currentDb: Awaited<ReturnType<typeof setupTestDb>>["db"];

  beforeEach(async () => {
    vi.clearAllMocks();
    const { db } = await setupTestDb();
    currentDb = db;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("given a submitted free-text question with an unapplied AI suggestion in ai_grade and showGradeAfterSubmit=true, when the student page renders, then the suggestion's feedback and score never appear on the page (positive control: the question title does render)", async () => {
    // Given: a course with one free-text question and one enrolled student,
    // configured with the MOST permissive student-side visibility setting
    // (showGradeAfterSubmit=true) so the test isolates the structural
    // invariant — suggestions live in `ai_grade` and the student page never
    // reads from that collection.
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
      showGradeAfterSubmit: true,
    });
    const q1 = await services.questionService.addQuestion(test.id, {
      title: "Explain why the sky is blue",
      content: "Provide a short paragraph.",
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

    // Student submits an answer and submits the test (status -> Submitted).
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      answer: { type: "free_text", text: "because of rayleigh scattering" },
    });
    const latestAnswers = await services.answerService.getLatestAnswers(
      test.id,
      student.id,
    );
    const answerV1 = latestAnswers.find((a) => a.questionId === q1.id);
    expect(answerV1).toBeDefined();
    const answerV1Id = answerV1?.id ?? "";
    await services.testSubmissionService.submitTest(test.id, student.id);

    // Seed an UNAPPLIED AI suggestion in `ai_grade` directly via the
    // collection — decouples the test from AiGradeService and Step 6's apply
    // path. The suggestion carries sentinel score/feedback values so the
    // negative assertions below cannot pass vacuously.
    const suggestionDoc: AiGradeSuggestionDocument = {
      id: "sugg-step-10",
      testId: test.id,
      questionId: q1.id,
      studentId: student.id,
      score: AI_SCORE_SENTINEL,
      feedback: AI_FEEDBACK_SENTINEL,
      gradedAgainstAnswerId: answerV1Id,
      model: AI_MODEL_NAME,
      gradedBy: AI_GRADER_ID,
      generatedByAdminId: "admin-1",
      generatedAt: new Date("2026-01-01T00:00:00Z"),
      regenerateReason: null,
      // appliedAt=null is the crux: the suggestion exists but no teacher has
      // promoted it via Apply, so no row should exist in the `grade`
      // collection. The student must see nothing of this suggestion.
      appliedAt: null,
      appliedBy: null,
    };
    await currentDb
      .collection<AiGradeSuggestionDocument>("ai_grade")
      .insertOne(suggestionDoc);

    // Sanity-check the negative-space premise: no `grade` row should exist
    // for this (testId, questionId, studentId). If a future regression
    // started writing the apply-result on suggestion insert, the structural
    // invariant would already be broken before the page render.
    const grade = await services.gradeService.getGrade(
      test.id,
      q1.id,
      student.id,
    );
    expect(grade).toBeNull();

    // When: the student opens the test page.
    mockStudentSession(student.id);
    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Then: NEITHER the unique feedback string NOR the unique score appears
    // anywhere on the page. The score is intentionally a sentinel that does
    // not appear in any surrounding copy (no "73/100", no "73%" elsewhere).
    expect(screen.queryByText(AI_FEEDBACK_SENTINEL)).toBeNull();
    expect(
      screen.queryByText(new RegExp(`\\b${AI_SCORE_SENTINEL}\\b`)),
    ).toBeNull();

    // Positive control: the page DID actually render — proves the negative
    // assertions above are not passing vacuously due to a render failure.
    // The question title is part of the rendered card header.
    expect(
      screen.getByText(/Explain why the sky is blue/i),
    ).toBeInTheDocument();

    // The page should show the "waiting to be graded" message (test is
    // Submitted, no grade row, no active redo). This is an additional
    // positive control proving the page reached the post-submit branch
    // where, if a leak existed, it would surface.
    expect(screen.getByText(/waiting to be graded/i)).toBeInTheDocument();
  });
});
