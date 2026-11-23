// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import { AiGradeJobTrigger } from "src/lib/ai-grade-job-service";
import { TEST_SCHOOL, TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GradingDetailStudent } from "../page-body/grading-detail-student";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: vi
      .fn()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL }),
  })),
}));

const RUNNER_JOB_ID = "0123456789abcdef01234567";

/** Stub that grades every question 80, so a round can be seeded through the service. */
const stubAiClient: AiClient = {
  async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
    return items.map((item) => ({
      questionId: item.questionId,
      score: 80,
      feedback: "Good",
    }));
  },
};

interface SeededSubmission {
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string;
  answerId: string;
}

/** Seeds a submitted student with one written answer, optionally with a finished earlier AI round. */
async function seedSubmission(options: {
  withSuggestions: boolean;
}): Promise<{ seed: SeededSubmission; renderPage: () => Promise<void> }> {
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
  const question = await services.questionService.addQuestion(test.id, {
    type: "free_text",
    title: "Q1",
    content: "Explain recursion",
    createdBy: "admin",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-1",
    username: "stu",
    name: "Stu",
    createdBy: "admin",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin",
  );
  const answer = await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "A function that calls itself." },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  if (options.withSuggestions) {
    await services.aiGradeService.generateForStudent(
      test.id,
      student.id,
      "admin-1",
    );
  }
  await services.aiGradeJobService.create({
    courseId: course.id,
    testId: test.id,
    studentId: student.id,
    questionId: null,
    trigger: AiGradeJobTrigger.AutoGrade,
    runnerJobId: RUNNER_JOB_ID,
    candidates: [{ questionId: question.id, answerId: answer.id }],
    reason: null,
    includeGraded: false,
    byAdminId: "admin-1",
  });

  return {
    seed: {
      courseId: course.id,
      testId: test.id,
      studentId: student.id,
      questionId: question.id,
      answerId: answer.id,
    },
    renderPage: async () => {
      render(
        await GradingDetailStudent({
          test,
          courseId: course.id,
          schoolId: TEST_SCHOOL_ID,
          student: {
            id: student.id,
            name: student.name,
            username: student.username,
          },
          basePath: `/admin/grading/${test.id}`,
        }),
      );
    },
  };
}

describe("Feature: a teacher sees AI grading in progress and cannot start another round", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb({ aiClient: stubAiClient });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the in-progress note and disables Auto-grade while a job is pending", async () => {
    // Given a submitted student whose AI grading job is still pending
    const { seed, renderPage } = await seedSubmission({
      withSuggestions: false,
    });

    // When the teacher opens the grading page
    await renderPage();

    // Then the page says grading is in progress and since when, in the teacher's own time
    const job = await getTestServices().aiGradeJobService.getLatestForStudent(
      seed.testId,
      seed.studentId,
    );
    expect(screen.getByTestId("ai-grading-in-progress")).toHaveTextContent(
      `AI grading in progress since ${job?.createdAt.toLocaleString()}`,
    );

    // And Auto-grade cannot be clicked again
    expect(
      screen.getByRole("button", { name: /auto-grade with ai/i }),
    ).toBeDisabled();
  });

  it("disables Regenerate all and Regenerate this answer while a job is pending over an earlier round", async () => {
    // Given a student with an earlier AI round and a newer job still pending
    const { renderPage } = await seedSubmission({ withSuggestions: true });

    // When the teacher opens the grading page
    await renderPage();

    // Then both regenerate triggers are disabled and the note is shown once
    expect(
      screen.getByRole("button", { name: /regenerate all/i }),
    ).toBeDisabled();
    expect(screen.getByTestId("ai-regenerate-question-trigger")).toBeDisabled();
    expect(screen.getAllByTestId("ai-grading-in-progress")).toHaveLength(1);
  });
});
