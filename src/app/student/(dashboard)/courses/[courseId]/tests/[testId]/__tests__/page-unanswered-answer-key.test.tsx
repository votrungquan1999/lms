// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { McOption } from "src/lib/question-service";
import { StudentSession } from "src/lib/session";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudentTestDetailPage from "../page";

const mockGetSession = vi.fn();
const mockRequireStudentSession = vi.fn();
// What the server hands the client answer form, as a client bundle would receive it.
const formOptions: McOption[][] = [];

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
vi.mock("../answer-form", () => ({
  AnswerForm: ({ options }: { options?: McOption[] }) => {
    if (options) {
      formOptions.push(JSON.parse(JSON.stringify(options)));
    }
    return null;
  },
}));

/**
 * Feature: an unanswered question never carries the answer key to the browser
 * As a teacher who left the test settings at their defaults
 * I want students who have not answered yet to receive no correct-answer marks
 * So that the answer key cannot be read from the page before answering.
 */
describe("Feature: Student test page — unanswered answer key", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    formOptions.length = 0;
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  /** Seeds an enrolled, signed-in student and a default-settings test with one MC question. */
  async function seedStudentWithCapitalQuestion() {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "admin",
    });
    // Default settings: correct answers are revealed after submitting.
    const test = await services.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "admin",
    });
    const question = await services.questionService.addQuestion(test.id, {
      title: "Capital",
      content: "Capital of France?",
      createdBy: "admin",
      type: "single_select",
      options: [
        { text: "Paris", isCorrect: true },
        { text: "Lyon", isCorrect: false },
      ],
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
    const session = new StudentSession({
      userId: "auth-1",
      username: "u1",
      studentId: student.id,
      schoolId: TEST_SCHOOL_ID,
    });
    signInAs(session);
    mockGetSession.mockResolvedValue(session);
    mockRequireStudentSession.mockResolvedValue(session);
    return { services, course, test, question, student };
  }

  async function renderStudentPage(courseId: string, testId: string) {
    render(
      await StudentTestDetailPage({
        params: Promise.resolve({ courseId, testId }),
      }),
    );
  }

  it("hands the answer form options with no option marked correct on a default-settings test", async () => {
    const { course, test } = await seedStudentWithCapitalQuestion();

    await renderStudentPage(course.id, test.id);

    expect(formOptions).toHaveLength(1);
    expect(formOptions[0].map((option) => option.text)).toEqual([
      "Paris",
      "Lyon",
    ]);
    expect(formOptions[0].map((option) => option.isCorrect)).toEqual([
      false,
      false,
    ]);
  });

  it("keeps the key off the answer form during a redo, though the reveal gate is open", async () => {
    const { services, course, test, question, student } =
      await seedStudentWithCapitalQuestion();
    const paris = question.options?.[0];
    await services.answerService.submitAnswer({
      testId: test.id,
      questionId: question.id,
      studentId: student.id,
      answer: { type: "mc", selectedIds: [paris?.id ?? ""] },
    });
    await services.testSubmissionService.submitTest(test.id, student.id);
    await services.redoRequestService.requestRedo(test.id, student.id, "admin");

    await renderStudentPage(course.id, test.id);

    expect(formOptions).toHaveLength(1);
    expect(formOptions[0].map((option) => option.isCorrect)).toEqual([
      false,
      false,
    ]);
  });
});
