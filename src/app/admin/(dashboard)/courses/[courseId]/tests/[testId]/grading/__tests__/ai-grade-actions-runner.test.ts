import type { AiClient, AiGradeBatchInput } from "src/lib/ai/ai-client";
import { BackgroundClaudeRunnerClient } from "src/lib/ai/background-claude-runner-client";
import { ready } from "src/lib/ai/runner-settings";
import {
  AiGradeJobStatus,
  AiGradeJobTrigger,
} from "src/lib/ai-grade-job-service";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoGradeSubmissionAction,
  regenerateQuestionAction,
  regenerateSubmissionAction,
} from "../ai-grade-actions";

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

interface SeededSubmission {
  courseId: string;
  testId: string;
  studentId: string;
  answerId: string;
  questionId: string;
}

/** Seeds a submitted student with one written answer. */
async function seedSubmittedStudent(): Promise<SeededSubmission> {
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
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain recursion",
    createdBy: "admin-1",
    type: "free_text",
  });
  const student = await services.studentService.createStudentDocument({
    authUserId: "auth-student",
    username: "student-user",
    name: "Student",
    createdBy: "admin-1",
  });
  await services.enrollmentService.enrollStudent(
    course.id,
    student.id,
    "admin-1",
  );
  const answer = await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: student.id,
    answer: { type: "free_text", text: "A function that calls itself." },
  });
  await services.testSubmissionService.submitTest(test.id, student.id);
  return {
    courseId: course.id,
    testId: test.id,
    studentId: student.id,
    answerId: answer.id,
    questionId: question.id,
  };
}

/** Builds the form an action receives. */
function formFor(seed: SeededSubmission): FormData {
  const form = new FormData();
  form.set("testId", seed.testId);
  form.set("courseId", seed.courseId);
  form.set("studentId", seed.studentId);
  return form;
}

describe("Feature: a teacher who starts AI grading is told it has started", () => {
  const gradeFreeTextBatch = vi.fn();
  const fakeFetch = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    gradeFreeTextBatch.mockImplementation(async (items: AiGradeBatchInput[]) =>
      items.map((item) => ({
        questionId: item.questionId,
        score: 80,
        feedback: "Good",
      })),
    );
    // A fresh Response per call: a body can be read only once.
    fakeFetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: RUNNER_JOB_ID, status: "queued" }), {
          status: 201,
        }),
    );
    const aiClient: AiClient = { gradeFreeTextBatch };
    const client = new BackgroundClaudeRunnerClient(
      { url: "https://runner.test", key: "bcr_svc_testkey" },
      { fetch: fakeFetch },
    );
    await setupTestDb({ aiClient, runnerClientProvider: () => ready(client) });
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("queues a runner job instead of grading on the spot when the runner accepts it", async () => {
    // Given a submitted student with one written answer and a ready runner
    const seed = await seedSubmittedStudent();

    // When the teacher clicks Auto-grade with AI
    const state = await autoGradeSubmissionAction(null, formFor(seed));

    // Then the teacher is told grading has started
    expect(state).toEqual({
      success: true,
      message:
        "AI grading started. Suggestions will appear here when it finishes.",
    });

    // And one pending job carries the snapshot the result will be saved against
    const services = getTestServices();
    const job = await services.aiGradeJobService.getLatestForStudent(
      seed.testId,
      seed.studentId,
    );
    expect(job).toMatchObject({
      schoolId: TEST_SCHOOL.id,
      courseId: seed.courseId,
      testId: seed.testId,
      studentId: seed.studentId,
      questionId: null,
      trigger: AiGradeJobTrigger.AutoGrade,
      runnerJobId: RUNNER_JOB_ID,
      candidates: [{ questionId: seed.questionId, answerId: seed.answerId }],
      reason: null,
      includeGraded: false,
      byAdminId: "admin-1",
      status: AiGradeJobStatus.Pending,
    });

    // And nothing was graded on the spot
    expect(
      await services.aiGradeService.hasAnySuggestionsForStudent(
        seed.testId,
        seed.studentId,
      ),
    ).toBe(false);
    expect(gradeFreeTextBatch).not.toHaveBeenCalled();

    // And the runner was asked exactly once, with the key and no reply address
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://runner.test/api/jobs");
    expect(init.headers.authorization).toBe("Bearer bcr_svc_testkey");
    expect(init.redirect).toBe("manual");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(["options", "prompt"]);
    expect(body.options).toEqual({ model: "sonnet" });
    expect(body.prompt).toContain("A function that calls itself.");
  });

  it("queues a regenerate-all job carrying the teacher's reason and the include-graded choice", async () => {
    // Given a submitted student and a ready runner
    const seed = await seedSubmittedStudent();
    const form = formFor(seed);
    form.set("reason", "Students use a base case first");
    form.set("includeGraded", "on");

    // When the teacher regenerates all, ticking the include-graded box
    const state = await regenerateSubmissionAction(null, form);

    // Then the teacher is told grading has started
    expect(state).toEqual({
      success: true,
      message:
        "AI grading started. Suggestions will appear here when it finishes.",
    });

    // And the pending job records the reason and the choice
    const job = await getTestServices().aiGradeJobService.getLatestForStudent(
      seed.testId,
      seed.studentId,
    );
    expect(job).toMatchObject({
      trigger: AiGradeJobTrigger.RegenerateAll,
      questionId: null,
      reason: "Students use a base case first",
      includeGraded: true,
      status: AiGradeJobStatus.Pending,
    });

    // And the reason travelled to the runner, with nothing graded on the spot
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fakeFetch.mock.calls[0][1].body).prompt).toContain(
      "Students use a base case first",
    );
    expect(gradeFreeTextBatch).not.toHaveBeenCalled();
  });

  it("queues a single-question job that names the question", async () => {
    // Given a submitted student and a ready runner
    const seed = await seedSubmittedStudent();
    const form = formFor(seed);
    form.set("questionId", seed.questionId);
    form.set("reason", "Reconsider the partial-credit cutoff");

    // When the teacher regenerates one answer
    const state = await regenerateQuestionAction(null, form);

    // Then the teacher is told grading has started
    expect(state).toEqual({
      success: true,
      message:
        "AI grading started. Suggestions will appear here when it finishes.",
    });

    // And the pending job is scoped to that question and counts graded answers in
    const job = await getTestServices().aiGradeJobService.getLatestForStudent(
      seed.testId,
      seed.studentId,
    );
    expect(job).toMatchObject({
      trigger: AiGradeJobTrigger.RegenerateQuestion,
      questionId: seed.questionId,
      reason: "Reconsider the partial-credit cutoff",
      includeGraded: true,
      candidates: [{ questionId: seed.questionId, answerId: seed.answerId }],
      status: AiGradeJobStatus.Pending,
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(gradeFreeTextBatch).not.toHaveBeenCalled();
  });

  it("refuses a second round while the first job is still pending, without calling the runner again", async () => {
    // Given a submission whose first Auto-grade click queued a job
    const seed = await seedSubmittedStudent();
    await autoGradeSubmissionAction(null, formFor(seed));
    const firstJob =
      await getTestServices().aiGradeJobService.getLatestForStudent(
        seed.testId,
        seed.studentId,
      );

    // When the teacher starts every kind of round again
    const regenerateForm = formFor(seed);
    regenerateForm.set("reason", "Try again");
    const questionForm = formFor(seed);
    questionForm.set("questionId", seed.questionId);
    questionForm.set("reason", "Try again");
    const states = [
      await autoGradeSubmissionAction(null, formFor(seed)),
      await regenerateSubmissionAction(null, regenerateForm),
      await regenerateQuestionAction(null, questionForm),
    ];

    // Then each is refused with the same message
    for (const state of states) {
      expect(state).toEqual({
        success: false,
        message: "AI grading is already in progress for this submission.",
      });
    }

    // And the runner was never asked again and the first job is still the latest
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const latest =
      await getTestServices().aiGradeJobService.getLatestForStudent(
        seed.testId,
        seed.studentId,
      );
    expect(latest?.id).toBe(firstJob?.id);
  });

  it("tells a stale Auto-grade click that grading is in progress, not that suggestions exist, while a regenerate job is pending", async () => {
    // Given a submission with suggestions and a regenerate job pending on the runner
    const seed = await seedSubmittedStudent();
    await getTestServices().aiGradeService.generateForStudent(
      seed.testId,
      seed.studentId,
      "admin-1",
    );
    const regenerateForm = formFor(seed);
    regenerateForm.set("reason", "Try again");
    await regenerateSubmissionAction(null, regenerateForm);

    // When the teacher's page, still showing the Auto-grade button, submits it
    const state = await autoGradeSubmissionAction(null, formFor(seed));

    // Then the in-progress message is shown
    expect(state).toEqual({
      success: false,
      message: "AI grading is already in progress for this submission.",
    });
  });
});
