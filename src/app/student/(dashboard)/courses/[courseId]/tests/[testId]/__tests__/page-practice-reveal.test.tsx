// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

// Same auth-singleton mock plumbing as page.test.tsx.
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

/**
 * Seeds a course + test + 1 free_text question + 1 enrolled student.
 * `isPractice` omitted from `opts` means the key is omitted from the
 * `createTest` call entirely (proves the Step-1 default, not just an
 * explicit `false`).
 */
async function seedPracticeFreeTextScenario(opts: {
  isPractice?: boolean;
  referenceAnswer?: string;
  explanation?: string;
}) {
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
    ...(opts.isPractice !== undefined ? { isPractice: opts.isPractice } : {}),
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain photosynthesis",
    createdBy: "admin",
    type: "free_text",
    referenceAnswer: opts.referenceAnswer,
    explanation: opts.explanation,
  });
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
  return { services, course, test, question, student };
}

describe("Feature: Student test page — practice-mode reveal (free_text)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("reveals the referenceAnswer and explanation after the student answers a practice free_text question", async () => {
    const REFERENCE_ANSWER =
      "Photosynthesis converts light into chemical energy.";
    const EXPLANATION = "Focus on the role of chlorophyll.";
    const { services, course, test, question, student } =
      await seedPracticeFreeTextScenario({
        isPractice: true,
        referenceAnswer: REFERENCE_ANSWER,
        explanation: EXPLANATION,
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText(REFERENCE_ANSWER)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
  });

  it("reveals the model answer only for the specific free_text question the student answered, not an unanswered sibling question", async () => {
    const ANSWERED_REFERENCE = "Answered question's model answer.";
    const UNANSWERED_REFERENCE = "Unanswered question's model answer.";
    const {
      services,
      course,
      test,
      question: answeredQuestion,
      student,
    } = await seedPracticeFreeTextScenario({
      isPractice: true,
      referenceAnswer: ANSWERED_REFERENCE,
    });
    await services.questionService.addQuestion(test.id, {
      title: "Q2",
      content: "Explain something else",
      createdBy: "admin",
      type: "free_text",
      referenceAnswer: UNANSWERED_REFERENCE,
    });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: answeredQuestion.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });
    // The second question is intentionally left unanswered.

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.getByText(ANSWERED_REFERENCE)).toBeInTheDocument();
    expect(screen.queryByText(UNANSWERED_REFERENCE)).toBeNull();
  });

  it("never reveals the authored model answer in a non-practice test, even after the student has answered (explicit isPractice: false)", async () => {
    const REFERENCE_ANSWER = "Secret model answer for an explicit-false test.";
    const { services, course, test, question, student } =
      await seedPracticeFreeTextScenario({
        isPractice: false,
        referenceAnswer: REFERENCE_ANSWER,
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
  });

  it("never reveals the authored model answer in a test created with isPractice omitted (default non-practice), even after the student has answered", async () => {
    const REFERENCE_ANSWER = "Secret model answer for a default-omitted test.";
    // `isPractice` deliberately absent from opts, so it's omitted from the
    // createTest call entirely — proves the Step-1 default is closed here,
    // not just an explicit `isPractice: false`.
    const { services, course, test, question, student } =
      await seedPracticeFreeTextScenario({
        referenceAnswer: REFERENCE_ANSWER,
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    expect(screen.queryByText(REFERENCE_ANSWER)).toBeNull();
  });

  it("R4 partial reveal: renders only the authored field (model answer) and omits the Explanation label when no explanation is authored", async () => {
    const REFERENCE_ANSWER = "Only the model answer is authored here.";
    const { services, course, test, question, student } =
      await seedPracticeFreeTextScenario({
        isPractice: true,
        referenceAnswer: REFERENCE_ANSWER,
        // explanation deliberately omitted
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Card is shown with the model answer; the Explanation sub-section is absent.
    expect(screen.getByText("Practice Reveal")).toBeInTheDocument();
    expect(screen.getByText(REFERENCE_ANSWER)).toBeInTheDocument();
    expect(screen.getByText("Model Answer")).toBeInTheDocument();
    expect(screen.queryByText("Explanation")).toBeNull();
  });

  it("R4 no-card: renders no Practice Reveal card at all when the answered free_text question has neither a model answer nor an explanation authored", async () => {
    const { services, course, test, question, student } =
      await seedPracticeFreeTextScenario({
        isPractice: true,
        // neither referenceAnswer nor explanation authored
      });

    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "free_text", text: "my answer" },
    });

    mockStudentSession(student.id);

    const ui = await StudentTestDetailPage({
      params: Promise.resolve({ courseId: course.id, testId: test.id }),
    });
    render(ui);

    // Answered, practice, but nothing to reveal → no empty card.
    expect(screen.queryByText("Practice Reveal")).toBeNull();
  });
});
