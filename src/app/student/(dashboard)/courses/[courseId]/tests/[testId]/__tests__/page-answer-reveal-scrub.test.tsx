// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { FreeTextQuestion, Question } from "src/lib/question-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();

// Captures the exact `questions` prop the page hands down to
// `TestQuestionsSection` — the scrub's real target (keeping the answer key
// out of what's handed downstream). `TestQuestionsSection` has no "use
// client" directive — it is a Server Component, not a client boundary — so
// this seam isolates `page.tsx`'s own scrub from downstream render gates,
// not a client/RSC serialization boundary. Delegates to the real component
// so every DOM assertion below still exercises the actual render path.
const capturedQuestions: Question[][] = [];
vi.mock("../test-questions-section", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../test-questions-section")>();
  return {
    TestQuestionsSection: (
      props: Parameters<typeof actual.TestQuestionsSection>[0],
    ) => {
      capturedQuestions.push(props.questions);
      return actual.TestQuestionsSection(props);
    },
  };
});

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

/** The scenario's single free_text question, as captured from the last render. */
function capturedFreeTextQuestion(): FreeTextQuestion | undefined {
  const q = capturedQuestions.at(-1)?.[0];
  return q?.type === "free_text" ? q : undefined;
}

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

const REFERENCE_ANSWER = "Photosynthesis converts light into chemical energy.";
const EXPLANATION = "Focus on the role of chlorophyll.";

/**
 * Seeds a course + non-practice test + one free_text question authored with
 * both a referenceAnswer and an explanation + one enrolled student. Each test
 * drives its own answer/submit/grade sequence from here.
 */
async function seedGatedFreeTextScenario(opts: {
  showCorrectAnswerAfterSubmit?: boolean;
  showGradeAfterSubmit?: boolean;
  answerRevealMode?: "diff" | "plain";
}) {
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
    ...(opts.showCorrectAnswerAfterSubmit !== undefined
      ? { showCorrectAnswerAfterSubmit: opts.showCorrectAnswerAfterSubmit }
      : {}),
    ...(opts.showGradeAfterSubmit !== undefined
      ? { showGradeAfterSubmit: opts.showGradeAfterSubmit }
      : {}),
    ...(opts.answerRevealMode !== undefined
      ? { answerRevealMode: opts.answerRevealMode }
      : {}),
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain photosynthesis",
    createdBy: "admin-1",
    type: "free_text",
    referenceAnswer: REFERENCE_ANSWER,
    explanation: EXPLANATION,
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: `auth-${test.id}`,
    username: `u-${test.id}`,
    name: "Stu",
    createdBy: "admin-1",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin-1",
  );
  return { services, course, test, question, student };
}

async function renderStudentPage(
  courseId: string,
  testId: string,
  studentId: string,
) {
  mockStudentSession(studentId);
  const ui = await StudentTestDetailPage({
    params: Promise.resolve({ courseId, testId }),
  });
  render(ui);
}

describe("Feature: Student test page — the model-answer reveal gate cannot be uncovered early (Step 10 security gate)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    capturedQuestions.length = 0;
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("MANDATORY hazard: never shows the model answer or explanation before the student has answered or submitted anything, even though correct-answer visibility defaults to on", async () => {
    // Given a test whose showCorrectAnswerAfterSubmit is left at its default
    // (true, per test-service.ts's createTest), a free_text question authored
    // with both a referenceAnswer and an explanation, and no answer/submission
    // of any kind yet.
    const { course, test, student } = await seedGatedFreeTextScenario({});

    // When the student loads the page having done nothing at all.
    await renderStudentPage(course.id, test.id, student.id);

    // Then neither field is anywhere on the page — though with no answer or
    // grade yet, the downstream render gates (hasFreeTextReveal needing a
    // studentAnswer, GradedQuestion needing `grade && !canAnswer`) would hide
    // both regardless of what the scrub does, so DOM absence alone doesn't
    // prove this conjunct. The captured payload below is what actually does.
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
    expect(screen.queryByText(EXPLANATION)).toBeNull();

    const q = capturedFreeTextQuestion();
    expect(q?.referenceAnswer).toBeUndefined();
    expect(q?.explanation).toBeUndefined();
  });

  it("reveals the model answer and explanation once the question is graded and correct answers are visible", async () => {
    // Given a plain-mode test (so the correct answer renders as written-out
    // text, not a diff — matching Steps 6/7), default correct-answer
    // visibility, a free_text question authored with both fields, a student
    // answer, and the test submitted and graded.
    const { services, course, test, question, student } =
      await seedGatedFreeTextScenario({ answerRevealMode: "plain" });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my attempt" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      gradedBy: "admin-1",
    });

    // When the student reloads the now-graded page.
    await renderStudentPage(course.id, test.id, student.id);

    // Then both fields are finally visible — the referenceAnswer via D34's
    // fallback (no grade.solution was set) and the explanation via Step 9's
    // widened gate. Neither could reach this real page before this step.
    expect(screen.getByText(REFERENCE_ANSWER)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();

    // And the scrub actually let both fields through into the payload.
    const q = capturedFreeTextQuestion();
    expect(q?.referenceAnswer).toBe(REFERENCE_ANSWER);
    expect(q?.explanation).toBe(EXPLANATION);
  });

  it("stays hidden when grades are released but correct answers are not (the two visibility flags are independent)", async () => {
    // Given a test where grades are visible (default showGradeAfterSubmit)
    // but correct answers are explicitly withheld.
    const { services, course, test, question, student } =
      await seedGatedFreeTextScenario({
        showCorrectAnswerAfterSubmit: false,
        answerRevealMode: "plain",
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my attempt" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      gradedBy: "admin-1",
    });

    // When the student views their (graded, but answer-key-withheld) result.
    await renderStudentPage(course.id, test.id, student.id);

    // Then correctAnswersVisible alone blocks the gate — neither field shows.
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
    expect(screen.queryByText(EXPLANATION)).toBeNull();

    const q = capturedFreeTextQuestion();
    expect(q?.referenceAnswer).toBeUndefined();
    expect(q?.explanation).toBeUndefined();
  });

  it("stays hidden when correct answers are released but grades are not (hasGrade is forced false)", async () => {
    // Given a test where correct answers are visible but grades are
    // explicitly withheld from the student.
    const { services, course, test, question, student } =
      await seedGatedFreeTextScenario({
        showGradeAfterSubmit: false,
        answerRevealMode: "plain",
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my attempt" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      gradedBy: "admin-1",
    });

    // When the student views the page (grade exists in storage, but is
    // withheld from this student by GradeVisibilityService).
    await renderStudentPage(course.id, test.id, student.id);

    // Then hasGrade(q) reads false (getStudentGrades returns []), so the
    // gate stays closed even though correctAnswersVisible is true.
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
    expect(screen.queryByText(EXPLANATION)).toBeNull();

    const q = capturedFreeTextQuestion();
    expect(q?.referenceAnswer).toBeUndefined();
    expect(q?.explanation).toBeUndefined();
  });

  it("stays hidden during an active redo, even with a stale grade from the student's prior submission", async () => {
    // Given a graded submission (a Grade row now exists for the question)...
    const { services, course, test, question, student } =
      await seedGatedFreeTextScenario({ answerRevealMode: "plain" });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "first attempt" },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.gradeService.gradeQuestion({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      score: 80,
      feedback: "",
      gradedBy: "admin-1",
    });

    // ...and the teacher has since requested a redo (canAnswer becomes true
    // again, while the prior grade row is left in place, now stale).
    await services.redoRequestService.requestRedo(
      test.id,
      student.id,
      "admin-1",
    );

    // When the student reopens the test to redo it.
    await renderStudentPage(course.id, test.id, student.id);

    // Then the stale grade does not open the gate — !canAnswer is false
    // during an active redo, so the model answer stays hidden.
    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
    expect(screen.queryByText(EXPLANATION)).toBeNull();

    const q = capturedFreeTextQuestion();
    expect(q?.referenceAnswer).toBeUndefined();
    expect(q?.explanation).toBeUndefined();
  });
});
