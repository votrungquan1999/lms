// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradingRouteKind } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import type { AiGradeBatchInput } from "src/lib/ai/ai-client";
import { BackgroundClaudeRunnerClient } from "src/lib/ai/background-claude-runner-client";
import { RunnerCheckAction, RunnerEventKind } from "src/lib/ai/runner-event";
import { ready } from "src/lib/ai/runner-settings";
import {
  AiGradeJobStatus,
  AiGradeJobTrigger,
} from "src/lib/ai-grade-job-service";
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
vi.mock(
  "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/pending-ai-grading-refresher.ui",
  () => ({
    PendingAiGradingRefresher: () => (
      <span data-testid="pending-ai-grading-refresher" />
    ),
  }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
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
const RUNNER_URL = "https://runner.test";
const RUNNER_KEY = "bcr_svc_test_key";

/** The Gemini stub must stay unused: the runner grades this round. */
const unusedAiClient = {
  async gradeFreeTextBatch(_items: AiGradeBatchInput[]) {
    throw new Error("Gemini must not grade a runner round");
  },
};

/** One request the fake runner saw. */
interface RunnerCall {
  method: string;
  url: string;
  authorization: string | null;
}

/**
 * A fake runner that answers status reads with `status` and full reads with
 * the job carrying `resultText`.
 * @param status - The job status the runner reports.
 * @param resultText - Reads the text of the finished job's result when asked, so it can name seeded ids.
 * @param fullOverrides - Fields that replace the full job's, e.g. an error in place of the result.
 */
function fakeRunner(
  status: string,
  resultText: () => string,
  fullOverrides: Record<string, unknown> = {},
) {
  const calls: RunnerCall[] = [];
  const fetchFake = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      const body = url.endsWith("?view=status")
        ? { status }
        : {
            id: RUNNER_JOB_ID,
            status,
            prompt: "p",
            model: "sonnet",
            source: "service",
            createdAt: "2026-11-24T10:00:00.000Z",
            startedAt: "2026-11-24T10:00:01.000Z",
            finishedAt: "2026-11-24T10:01:00.000Z",
            result: {
              text: resultText(),
              durationMs: 59000,
              numTurns: 1,
              sessionId: "s",
            },
            error: null,
            usage: [
              {
                model: "claude-sonnet-4-5",
                attempt: 1,
                partial: false,
                inputTokens: 100,
                outputTokens: 50,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                thinkingTokens: 0,
                webSearchRequests: 0,
                costUSD: 0.01,
              },
            ],
            files: [],
            waitReason: null,
            waitUntil: null,
            ...fullOverrides,
          };
      return new Response(JSON.stringify(body), { status: 200 });
    },
  );
  return { fetchFake, calls };
}

/** Seeds a submitted student with one written answer and a pending runner job. */
async function seedPendingJob() {
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
  return { test, course, student, question, answer };
}

/** Renders the grading detail for a seeded submission. */
async function renderPage(seed: Awaited<ReturnType<typeof seedPendingJob>>) {
  render(
    await GradingDetailStudent({
      screen: await (
        await import("src/lib/grading-screen-read")
      ).readGradingScreen(TEST_SCHOOL_ID, seed.test),
      test: seed.test,
      courseId: seed.course.id,
      schoolId: TEST_SCHOOL_ID,
      student: {
        id: seed.student.id,
        name: seed.student.name,
        username: seed.student.username,
      },
      basePath: `/admin/grading/${seed.test.id}`,
      routeKind: GradingRouteKind.Hub,
    }),
  );
}

describe("Feature: a teacher finds the runner's finished suggestions when the grading page renders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("saves one Claude-labelled round and shows it when the runner job has succeeded", async () => {
    // Given a pending job the runner has finished with a fenced JSON result
    let questionId = "";
    const runner = fakeRunner("succeeded", () =>
      readFileSync(
        "src/lib/ai/__tests__/fixtures/runner-result.txt",
        "utf8",
      ).replaceAll("QUESTION_ID", questionId),
    );
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: runner.fetchFake, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: unusedAiClient,
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();
    questionId = seed.question.id;

    // When the teacher opens the grading page
    await renderPage(seed);

    // Then the round is saved once, labelled as graded by Claude
    const services = getTestServices();
    const suggestions = await services.aiGradeService.getSuggestionsForStudent(
      seed.test.id,
      seed.student.id,
    );
    const rows = suggestions.get(seed.question.id) ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: "claude-sonnet",
      score: 85,
      gradedAgainstAnswerId: seed.answer.id,
    });

    // And the same render shows the suggestion, with neither the in-progress nor the failure note
    expect(screen.getAllByTestId("ai-suggestion-row")).toHaveLength(1);
    expect(screen.queryByTestId("ai-grading-in-progress")).toBeNull();
    expect(screen.queryByTestId("ai-grading-failed")).toBeNull();

    // And the job is finished
    const job = await services.aiGradeJobService.getLatestForStudent(
      seed.test.id,
      seed.student.id,
    );
    expect(job?.status).toBe(AiGradeJobStatus.Succeeded);
    expect(job?.finishedAt).not.toBeNull();

    // And the runner was asked for the status, then the full job, with the key
    expect(runner.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${RUNNER_URL}/api/jobs/${RUNNER_JOB_ID}?view=status`,
      `GET ${RUNNER_URL}/api/jobs/${RUNNER_JOB_ID}`,
    ]);
    expect(
      runner.calls.every((c) => c.authorization === `Bearer ${RUNNER_KEY}`),
    ).toBe(true);
  });

  it("saves and shows a suggestion for a question the teacher graded meanwhile, leaving the teacher's grade untouched", async () => {
    // Given a pending job and a teacher who grades the question by hand before the result lands
    let questionId = "";
    const runner = fakeRunner("succeeded", () =>
      readFileSync(
        "src/lib/ai/__tests__/fixtures/runner-result.txt",
        "utf8",
      ).replaceAll("QUESTION_ID", questionId),
    );
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: runner.fetchFake, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: unusedAiClient,
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();
    questionId = seed.question.id;
    const services = getTestServices();
    await services.gradeService.gradeQuestion({
      testId: seed.test.id,
      questionId,
      studentId: seed.student.id,
      score: 60,
      feedback: "Teacher feedback",
      gradedBy: "admin-1",
    });

    // When the teacher opens the grading page and the result is collected
    await renderPage(seed);

    // Then the AI suggestion is saved and shown
    expect(screen.getAllByTestId("ai-suggestion-row")).toHaveLength(1);
    const suggestions = await services.aiGradeService.getSuggestionsForStudent(
      seed.test.id,
      seed.student.id,
    );
    expect(suggestions.get(questionId)?.[0]).toMatchObject({ score: 85 });

    // And the teacher's own grade is exactly as they left it
    expect(
      await services.gradeService.getGrade(
        seed.test.id,
        questionId,
        seed.student.id,
      ),
    ).toMatchObject({ score: 60, feedback: "Teacher feedback" });
  });

  it.each(["queued", "running"])(
    "keeps the job pending and reads no result while the runner reports %s",
    async (runnerStatus) => {
      // Given a pending job the runner has not finished
      const runner = fakeRunner(runnerStatus, () => "unused");
      const client = new BackgroundClaudeRunnerClient(
        { url: RUNNER_URL, key: RUNNER_KEY },
        { fetch: runner.fetchFake, timeoutMs: { create: 50, read: 500 } },
      );
      await setupTestDb({
        aiClient: unusedAiClient,
        runnerClientProvider: () => ready(client),
      });
      const seed = await seedPendingJob();

      // When the teacher opens the grading page
      await renderPage(seed);

      // Then the page still says grading is in progress and shows no suggestion
      expect(screen.getByTestId("ai-grading-in-progress")).toBeInTheDocument();
      expect(screen.queryByTestId("ai-suggestion-row")).toBeNull();

      // And only the status was read
      expect(runner.calls.map((c) => c.url)).toEqual([
        `${RUNNER_URL}/api/jobs/${RUNNER_JOB_ID}?view=status`,
      ]);

      // And the job is still pending
      const job = await getTestServices().aiGradeJobService.getLatestForStudent(
        seed.test.id,
        seed.student.id,
      );
      expect(job?.status).toBe(AiGradeJobStatus.Pending);
    },
  );

  it("marks the job failed, saves nothing and offers a retry when the runner job failed", async () => {
    // Given a pending job the runner reports as failed with a timeout
    const runner = fakeRunner("failed", () => "unused", {
      result: null,
      error: { kind: "timeout", message: "Ran out of time" },
    });
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: runner.fetchFake, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: unusedAiClient,
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();

    // When the teacher opens the grading page
    await renderPage(seed);

    // Then the job is failed with the runner's error kind, and no suggestion exists
    const services = getTestServices();
    const job = await services.aiGradeJobService.getLatestForStudent(
      seed.test.id,
      seed.student.id,
    );
    expect(job).toMatchObject({
      status: AiGradeJobStatus.Failed,
      errorKind: "timeout",
      errorMessage: "Ran out of time",
    });
    expect(
      (
        await services.aiGradeService.getSuggestionsForStudent(
          seed.test.id,
          seed.student.id,
        )
      ).size,
    ).toBe(0);

    // And the page says the attempt did not finish and Auto-grade can be clicked again
    expect(screen.getByTestId("ai-grading-failed")).toHaveTextContent(
      "The last AI grading attempt did not finish. You can try again.",
    );
    expect(screen.queryByTestId("ai-grading-in-progress")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(
      await screen.findByRole("menuitem", { name: "Auto-grade with AI" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("still renders the page with the in-progress note and the job pending when the runner cannot be reached", async () => {
    // Given a pending job and a runner whose requests fail at the network
    const unreachable = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: unreachable, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: unusedAiClient,
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();

    // When the teacher opens the grading page
    await renderPage(seed);

    // Then the page still says grading is in progress, with the trigger disabled
    expect(screen.getByTestId("ai-grading-in-progress")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(
      await screen.findByRole("menuitem", { name: "Auto-grade with AI" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByTestId("ai-suggestion-row")).toBeNull();

    // And the job is untouched, so a later check can pick the result up
    const job = await getTestServices().aiGradeJobService.getLatestForStudent(
      seed.test.id,
      seed.student.id,
    );
    expect(job?.status).toBe(AiGradeJobStatus.Pending);
    expect(job?.finishedAt).toBeNull();
  });

  it("hides the failure note once a later Gemini round has saved newer suggestions", async () => {
    // Given a job the runner failed, whose note the first render shows
    const runner = fakeRunner("failed", () => "unused", {
      result: null,
      error: { kind: "timeout", message: "Ran out of time" },
    });
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: runner.fetchFake, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: {
        async gradeFreeTextBatch(items: AiGradeBatchInput[]) {
          return items.map((item) => ({
            questionId: item.questionId,
            score: 80,
            feedback: "Good",
          }));
        },
      },
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();
    await renderPage(seed);
    expect(screen.getByTestId("ai-grading-failed")).toBeInTheDocument();
    cleanup();

    // When a later round grades through Gemini, leaving the failed job as the latest job
    await new Promise((resolve) => setTimeout(resolve, 5));
    await getTestServices().aiGradeService.generateForStudent(
      seed.test.id,
      seed.student.id,
      "admin-1",
    );
    await renderPage(seed);

    // Then the page shows the new suggestion and no "did not finish" note
    expect(screen.getAllByTestId("ai-suggestion-row")).toHaveLength(1);
    expect(screen.queryByTestId("ai-grading-failed")).toBeNull();
  });

  it("keeps the page refreshing for one more render when another tab won the claim on the finished job", async () => {
    // Given a finished job that another tab claims between this render's status read and its claim
    let claimedBefore = false;
    const claimByOtherTab = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("?view=status")) {
        return new Response(JSON.stringify({ status: "succeeded" }), {
          status: 200,
        });
      }
      if (!claimedBefore) {
        claimedBefore = true;
        await getTestServices().aiGradeJobService.claimFinal(
          RUNNER_JOB_ID,
          {
            status: AiGradeJobStatus.Succeeded,
            errorKind: null,
            errorMessage: null,
          },
          {
            at: new Date(),
            kind: RunnerEventKind.Check,
            runnerJobId: RUNNER_JOB_ID,
            runnerStatus: "succeeded",
            action: RunnerCheckAction.SavedSuggestions,
            savedCount: 0,
          },
        );
      }
      return new Response(
        JSON.stringify({
          id: RUNNER_JOB_ID,
          status: "succeeded",
          result: { text: "{}", durationMs: 1, numTurns: 1, sessionId: "s" },
          error: null,
          usage: [],
        }),
        { status: 200 },
      );
    };
    const client = new BackgroundClaudeRunnerClient(
      { url: RUNNER_URL, key: RUNNER_KEY },
      { fetch: claimByOtherTab, timeoutMs: { create: 50, read: 500 } },
    );
    await setupTestDb({
      aiClient: unusedAiClient,
      runnerClientProvider: () => ready(client),
    });
    const seed = await seedPendingJob();

    // When this tab's page renders and loses the claim, before the winner's rows exist
    await renderPage(seed);

    // Then the page still counts as in progress and refreshes, so the winner's rows appear without a reload
    expect(screen.getByTestId("ai-grading-in-progress")).toBeInTheDocument();
    expect(
      screen.getByTestId("pending-ai-grading-refresher"),
    ).toBeInTheDocument();
  });
});
