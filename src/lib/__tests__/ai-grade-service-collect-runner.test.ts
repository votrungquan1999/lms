import { readFileSync } from "node:fs";
import { context, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { Db } from "mongodb";
import { BackgroundClaudeRunnerClient } from "src/lib/ai/background-claude-runner-client";
import { RunnerCheckAction, RunnerEventKind } from "src/lib/ai/runner-event";
import {
  type RunnerClientResolution,
  RunnerClientResolutionKind,
  ready,
} from "src/lib/ai/runner-settings";
import {
  AiGradeJobStatus,
  AiGradeJobTrigger,
} from "src/lib/ai-grade-job-service";
import {
  CollectOutcomeKind,
  StartRoundOutcomeKind,
} from "src/lib/ai-grade-types";
import { withSpan } from "src/lib/observability/with-span";
import { registerAsyncContextManager } from "src/tests/async-context-manager";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const RUNNER_JOB_ID = "0123456789abcdef01234567";
const RUNNER_URL = "https://runner.test";

/** A fetch the fake runner answers with. */
type FakeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Builds the full runner job the fake runner returns. */
function runnerJobBody(status: string, resultText: string) {
  return {
    id: RUNNER_JOB_ID,
    status,
    result: { text: resultText, durationMs: 1, numTurns: 1, sessionId: "s" },
    error: null,
    usage: [
      {
        model: "claude-sonnet-4-5",
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 10,
        cacheCreationInputTokens: 5,
        thinkingTokens: 7,
        costUSD: 0.02,
      },
      { model: "claude-haiku-4-5", inputTokens: 1, costUSD: 0.01 },
    ],
  };
}

/**
 * A fake runner reporting `status`; a full read returns the job whose result
 * is the fixture with the question id filled in.
 * @param status - The job status the runner reports.
 * @param questionId - The id the fixture's grade names.
 * @param beforeAnswer - Runs before each answer, so a test can hold reads back.
 */
function fakeRunnerFetch(
  status: string,
  questionId: string,
  beforeAnswer: (url: string) => Promise<void> = async () => undefined,
): FakeFetch {
  const text = readFileSync(
    "src/lib/ai/__tests__/fixtures/runner-result.txt",
    "utf8",
  ).replaceAll("QUESTION_ID", questionId);
  return async (input) => {
    const url = String(input);
    await beforeAnswer(url);
    const body = url.endsWith("?view=status")
      ? { status }
      : runnerJobBody(status, text);
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

/**
 * Seeds a submitted student with one written answer and a pending runner job.
 * @param db - The test database.
 * @param makeFetch - Builds the fake runner fetch once the question id exists.
 * @param options - `readTimeoutMs` shortens the client's read timeout; `resolve` replaces how the provider answers; `extraCandidates` snapshots that many more questions the first answer's job also covers.
 */
async function seedPendingRunnerJob(
  db: Db,
  makeFetch: (questionId: string) => FakeFetch,
  options: {
    readTimeoutMs?: number;
    resolve?: (ready: RunnerClientResolution) => RunnerClientResolution;
    extraCandidates?: number;
  } = {},
) {
  await insertRawCourses(db, ["course-1"]);
  // The fake names the seeded question, so the provider reads its id lazily.
  let questionId = "";
  const services = buildCoreServices(db, {
    runnerClientProvider: () => {
      const resolution = ready(
        new BackgroundClaudeRunnerClient(
          { url: RUNNER_URL, key: "bcr_svc_key" },
          {
            fetch: makeFetch(questionId),
            timeoutMs: { create: 50, read: options.readTimeoutMs ?? 2000 },
          },
        ),
      );
      return options.resolve?.(resolution) ?? resolution;
    },
  });
  const test = await services.testService.createTest("course-1", {
    title: "T",
    description: "",
    createdBy: "admin-1",
  });
  const question = await services.questionService.addQuestion(test.id, {
    title: "Q1",
    content: "Explain recursion",
    createdBy: "admin-1",
    type: "free_text",
  });
  questionId = question.id;
  const answer = await services.answerService.submitAnswer({
    testId: test.id,
    questionId: question.id,
    studentId: "student-1",
    answer: { type: "free_text", text: "A function that calls itself." },
  });
  const candidates = [{ questionId: question.id, answerId: answer.id }];
  for (let i = 0; i < (options.extraCandidates ?? 0); i++) {
    const extra = await services.questionService.addQuestion(test.id, {
      title: `Extra ${i}`,
      content: "Explain iteration",
      createdBy: "admin-1",
      type: "free_text",
    });
    const extraAnswer = await services.answerService.submitAnswer({
      testId: test.id,
      questionId: extra.id,
      studentId: "student-1",
      answer: { type: "free_text", text: "A loop." },
    });
    candidates.push({ questionId: extra.id, answerId: extraAnswer.id });
  }
  await services.aiGradeJobService.create({
    courseId: "course-1",
    testId: test.id,
    studentId: "student-1",
    questionId: null,
    trigger: AiGradeJobTrigger.AutoGrade,
    runnerJobId: RUNNER_JOB_ID,
    candidates,
    reason: "regrade please",
    includeGraded: false,
    byAdminId: "admin-1",
  });
  return { services, test, question, answer };
}

describe("AiGradeService.collectRunnerResult - a succeeded runner job", () => {
  dbIt(
    "saves one Claude-labelled row per snapshot candidate and ends the job",
    async ({ db }) => {
      // Given a pending job the runner has finished
      const { services, test, question, answer } = await seedPendingRunnerJob(
        db,
        (questionId) => fakeRunnerFetch("succeeded", questionId),
      );

      // When the result is collected
      const outcome = await services.aiGradeService.collectRunnerResult(
        test.id,
        "student-1",
      );

      // Then one row is saved for the candidate, labelled as graded by Claude
      expect(outcome).toEqual({ kind: CollectOutcomeKind.Saved, count: 1 });
      const rows = await db
        .collection("ai_grade")
        .find({ testId: test.id })
        .toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        questionId: question.id,
        model: "claude-sonnet",
        gradedBy: "ai:claude-sonnet",
        gradedAgainstAnswerId: answer.id,
        regenerateReason: "regrade please",
        generatedByAdminId: "admin-1",
        score: 85,
      });

      // And the job is succeeded and finished
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.status).toBe(AiGradeJobStatus.Succeeded);
      expect(job?.finishedAt).toBeInstanceOf(Date);
    },
  );
});

describe("AiGradeService.collectRunnerResult - two checks of the same finished job", () => {
  dbIt(
    "saves the round once: one check saves, the other finds it claimed",
    async ({ db }) => {
      // Given a finished job and a runner that holds each kind of read until both checks have asked
      const waiting: Record<string, (() => void)[]> = {};
      const bothAsked = (kind: string) =>
        new Promise<void>((resolve) => {
          waiting[kind] = [...(waiting[kind] ?? []), resolve];
          if (waiting[kind].length === 2) {
            for (const release of waiting[kind]) release();
          }
        });
      const { services, test } = await seedPendingRunnerJob(db, (questionId) =>
        fakeRunnerFetch("succeeded", questionId, (url) =>
          bothAsked(url.endsWith("?view=status") ? "status" : "job"),
        ),
      );

      // When both checks run at the same time
      const outcomes = await Promise.all([
        services.aiGradeService.collectRunnerResult(test.id, "student-1"),
        services.aiGradeService.collectRunnerResult(test.id, "student-1"),
      ]);

      // Then exactly one saves and the other finds the job already claimed
      expect(outcomes.map((o) => o.kind).sort()).toEqual([
        CollectOutcomeKind.ClaimedElsewhere,
        CollectOutcomeKind.Saved,
      ]);

      // And the round exists once
      expect(
        await db.collection("ai_grade").countDocuments({ testId: test.id }),
      ).toBe(1);
    },
  );

  dbIt(
    "finds no pending job on a later check, leaving the round as saved",
    async ({ db }) => {
      // Given a job whose result a first check already saved
      const { services, test } = await seedPendingRunnerJob(db, (questionId) =>
        fakeRunnerFetch("succeeded", questionId),
      );
      await services.aiGradeService.collectRunnerResult(test.id, "student-1");

      // When another check runs
      const outcome = await services.aiGradeService.collectRunnerResult(
        test.id,
        "student-1",
      );

      // Then it has nothing to do and saves nothing more
      expect(outcome).toEqual({ kind: CollectOutcomeKind.NoPendingJob });
      expect(
        await db.collection("ai_grade").countDocuments({ testId: test.id }),
      ).toBe(1);
    },
  );
});

describe("AiGradeService.collectRunnerResult - a job that did not produce suggestions", () => {
  /**
   * A runner whose status and full-job answers are fixed by the test.
   * @param statusReply - Answers the status read.
   * @param jobReply - Answers the full read.
   */
  function scriptedFetch(
    statusReply: () => Response,
    jobReply: () => Response,
  ): (questionId: string) => FakeFetch {
    return () => async (input) =>
      String(input).endsWith("?view=status") ? statusReply() : jobReply();
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  const finishedJob = (status: string, extra: Record<string, unknown>) => ({
    id: RUNNER_JOB_ID,
    status,
    result: null,
    error: null,
    ...extra,
  });

  const cases: {
    name: string;
    fetchFor: (questionId: string) => FakeFetch;
    errorKind: string;
    errorMessage: string;
  }[] = [
    {
      name: "the runner cancelled the job",
      fetchFor: scriptedFetch(
        () => json({ status: "cancelled" }),
        () => json({}),
      ),
      errorKind: "cancelled",
      errorMessage: "The runner job was cancelled",
    },
    {
      name: "the runner does not know the job",
      fetchFor: scriptedFetch(
        () => json({ error: "not found" }, 404),
        () => json({}),
      ),
      errorKind: "not_found",
      errorMessage: "The runner has no such job",
    },
    {
      name: "the runner loses the job between the status read and the full read",
      fetchFor: scriptedFetch(
        () => json({ status: "succeeded" }),
        () => json({ error: "not found" }, 404),
      ),
      errorKind: "not_found",
      errorMessage: "The runner has no such job",
    },
    {
      name: "a succeeded job carries no result",
      fetchFor: scriptedFetch(
        () => json({ status: "succeeded" }),
        () => json(finishedJob("succeeded", {})),
      ),
      errorKind: "bad_result",
      errorMessage: "missing_result",
    },
    {
      name: "the result is prose",
      fetchFor: scriptedFetch(
        () => json({ status: "succeeded" }),
        () =>
          json(
            finishedJob("succeeded", {
              result: { text: "Here are the grades: great work" },
            }),
          ),
      ),
      errorKind: "bad_result",
      errorMessage: "not_json",
    },
    {
      name: "the result grades a different question than the snapshot's",
      fetchFor: scriptedFetch(
        () => json({ status: "succeeded" }),
        () =>
          json(
            finishedJob("succeeded", {
              result: {
                text: JSON.stringify({
                  grades: [{ questionId: "other", score: 50, feedback: "ok" }],
                }),
              },
            }),
          ),
      ),
      errorKind: "bad_result",
      errorMessage: "missing_candidate",
    },
  ];

  for (const c of cases) {
    dbIt(
      `marks the job failed and saves nothing when ${c.name}`,
      async ({ db }) => {
        // Given a pending job in that state at the runner
        const { services, test } = await seedPendingRunnerJob(db, c.fetchFor);

        // When the result is collected
        const outcome = await services.aiGradeService.collectRunnerResult(
          test.id,
          "student-1",
        );

        // Then the job is failed with the kind and a short reason, and no suggestion exists
        expect(outcome).toEqual({
          kind: CollectOutcomeKind.MarkedFailed,
          errorKind: c.errorKind,
        });
        const job = await services.aiGradeJobService.getLatestForStudent(
          test.id,
          "student-1",
        );
        expect(job).toMatchObject({
          status: AiGradeJobStatus.Failed,
          errorKind: c.errorKind,
          errorMessage: c.errorMessage,
        });
        expect(
          await db.collection("ai_grade").countDocuments({ testId: test.id }),
        ).toBe(0);
      },
    );
  }

  dbIt(
    "marks the job failed and saves nothing when the result grades only some of the snapshot's questions",
    async ({ db }) => {
      // Given a snapshot of three questions and a runner result grading just the first
      const { services, test } = await seedPendingRunnerJob(
        db,
        (questionId) => fakeRunnerFetch("succeeded", questionId),
        { extraCandidates: 2 },
      );

      // When the result is collected
      const outcome = await services.aiGradeService.collectRunnerResult(
        test.id,
        "student-1",
      );

      // Then the job fails as a bad result and no suggestion exists
      expect(outcome).toEqual({
        kind: CollectOutcomeKind.MarkedFailed,
        errorKind: "bad_result",
      });
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job).toMatchObject({
        status: AiGradeJobStatus.Failed,
        errorMessage: "missing_candidate",
      });
      expect(
        await db.collection("ai_grade").countDocuments({ testId: test.id }),
      ).toBe(0);
    },
  );

  dbIt(
    "stores at most 500 characters of the runner's error message",
    async ({ db }) => {
      // Given a runner job that failed with a 600-character message
      const { services, test } = await seedPendingRunnerJob(
        db,
        () => async (input) =>
          String(input).endsWith("?view=status")
            ? json({ status: "failed" })
            : json(
                finishedJob("failed", {
                  error: { kind: "timeout", message: "x".repeat(600) },
                }),
              ),
      );

      // When the result is collected
      await services.aiGradeService.collectRunnerResult(test.id, "student-1");

      // Then the stored message is cut to 500 characters
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.errorMessage).toBe("x".repeat(500));
    },
  );

  dbIt("accepts a new round once the failed job has ended", async ({ db }) => {
    // Given a job that failed at the runner
    const { services, test } = await seedPendingRunnerJob(
      db,
      (_questionId) => async (input, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST")
          return json({ id: "fedcba987654321001234567" }, 201);
        return url.endsWith("?view=status")
          ? json({ status: "failed" })
          : json(
              finishedJob("failed", {
                error: { kind: "timeout", message: "Ran out of time" },
              }),
            );
      },
    );
    await services.aiGradeService.collectRunnerResult(test.id, "student-1");

    // When the teacher starts another round
    const outcome = await services.aiGradeService.startRound({
      trigger: AiGradeJobTrigger.AutoGrade,
      testId: test.id,
      courseId: "course-1",
      studentId: "student-1",
      reason: null,
      includeGraded: false,
      byAdminId: "admin-1",
    });

    // Then a new pending job is queued
    expect(outcome.kind).toBe(StartRoundOutcomeKind.Queued);
  });
});

describe("AiGradeService.collectRunnerResult - a runner that cannot be reached", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  /** A fake that never answers until the client's timeout aborts the request. */
  const hangUntilAborted: FakeFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(init.signal?.reason),
      );
    });

  const cases: {
    name: string;
    fetchFor: (questionId: string) => FakeFetch;
    cause: string;
    options?: Parameters<typeof seedPendingRunnerJob>[2];
  }[] = [
    {
      name: "the request fails at the network",
      fetchFor: () => async () => {
        throw new TypeError("fetch failed");
      },
      cause: "TypeError",
    },
    {
      name: "the runner answers 503",
      fetchFor: () => async () => json({ error: "down" }, 503),
      cause: "status_503",
    },
    {
      name: "the runner rejects the service key",
      fetchFor: () => async () => json({ error: "unauthorized" }, 401),
      cause: "refused_401",
    },
    {
      name: "the status read succeeds but the full read fails",
      fetchFor: () => async (input) => {
        if (String(input).endsWith("?view=status")) {
          return json({ status: "succeeded" });
        }
        throw new TypeError("fetch failed");
      },
      cause: "TypeError",
    },
    {
      name: "the runner never answers within the read timeout",
      fetchFor: () => hangUntilAborted,
      cause: "TimeoutError",
      options: { readTimeoutMs: 20 },
    },
    {
      name: "a runner setting is unusable",
      fetchFor: () => async () => json({ status: "succeeded" }),
      cause: "RunnerSettingsError",
      options: {
        resolve: () => ({
          kind: RunnerClientResolutionKind.Invalid,
          variable: "BACKGROUND_CLAUDE_RUNNER_URL",
        }),
      },
    },
    {
      name: "the runner is turned off",
      fetchFor: () => async () => json({ status: "succeeded" }),
      cause: "RunnerDisabled",
      options: {
        resolve: () => ({ kind: RunnerClientResolutionKind.Disabled }),
      },
    },
  ];

  for (const c of cases) {
    dbIt(
      `skips the check and leaves the job pending when ${c.name}`,
      async ({ db }) => {
        // Given a pending job and a runner in that state
        const { services, test } = await seedPendingRunnerJob(
          db,
          c.fetchFor,
          c.options,
        );

        // When the result is collected
        const outcome = await services.aiGradeService.collectRunnerResult(
          test.id,
          "student-1",
        );

        // Then the check is skipped, naming the error only
        expect(outcome).toEqual({
          kind: CollectOutcomeKind.SkippedUnreachable,
          cause: c.cause,
        });

        // And the job is still pending, with no suggestion saved
        const job = await services.aiGradeJobService.getLatestForStudent(
          test.id,
          "student-1",
        );
        expect(job?.status).toBe(AiGradeJobStatus.Pending);
        expect(job?.finishedAt).toBeNull();
        expect(
          await db.collection("ai_grade").countDocuments({ testId: test.id }),
        ).toBe(0);
      },
    );
  }

  dbIt(
    "saves the round on a later check once the runner answers again",
    async ({ db }) => {
      // Given a pending job and a runner that is down for the first check
      let isUp = false;
      const { services, test, question } = await seedPendingRunnerJob(
        db,
        (questionId) => {
          const healthy = fakeRunnerFetch("succeeded", questionId);
          return async (input, init) => {
            if (!isUp) throw new TypeError("fetch failed");
            return healthy(input, init);
          };
        },
      );
      const first = await services.aiGradeService.collectRunnerResult(
        test.id,
        "student-1",
      );

      // When the runner is back and the page checks again
      isUp = true;
      const second = await services.aiGradeService.collectRunnerResult(
        test.id,
        "student-1",
      );

      // Then the first check was skipped and the second saves the round
      expect(first.kind).toBe(CollectOutcomeKind.SkippedUnreachable);
      expect(second).toEqual({ kind: CollectOutcomeKind.Saved, count: 1 });
      const rows = await db
        .collection("ai_grade")
        .find({ testId: test.id })
        .toArray();
      expect(rows.map((r) => r.questionId)).toEqual([question.id]);
    },
  );
});

describe("AiGradeService.collectRunnerResult - the record of each check", () => {
  let exporter: InMemorySpanExporter;

  beforeEach(() => {
    registerAsyncContextManager();
    exporter = new InMemorySpanExporter();
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
  });

  afterEach(() => {
    trace.disable();
    context.disable();
  });

  /**
   * Runs one check inside a span, like the traced service does in production.
   * @param services - The built services.
   * @param testId - The test.
   */
  async function checkInSpan(
    services: Awaited<ReturnType<typeof seedPendingRunnerJob>>["services"],
    testId: string,
  ) {
    await withSpan("aiGrade.collectRunnerResult", {}, () =>
      services.aiGradeService.collectRunnerResult(testId, "student-1"),
    );
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name === "aiGrade.collectRunnerResult");
    exporter.reset();
    return spans[0];
  }

  dbIt(
    "records the ending check on the span with usage and in the job's history",
    async ({ db }) => {
      // Given a pending job the runner has finished
      const { services, test } = await seedPendingRunnerJob(db, (questionId) =>
        fakeRunnerFetch("succeeded", questionId),
      );

      // When the check that ends it runs
      const span = await checkInSpan(services, test.id);

      // Then the span names the job, what the runner said, what the LMS did and the usage
      expect(span?.attributes).toMatchObject({
        "lms.ai.runner_job_id": RUNNER_JOB_ID,
        "lms.ai.runner.status": "succeeded",
        "lms.ai.runner.action": "saved_suggestions",
        "lms.ai.runner.saved_count": 1,
        "gen_ai.usage.input_tokens": 101,
        "gen_ai.usage.output_tokens": 50,
        "gen_ai.usage.cache_read.input_tokens": 10,
        "gen_ai.usage.cache_creation.input_tokens": 5,
        "lms.ai.usage.thinking_tokens": 7,
        "lms.ai.runner.cost_usd": 0.03,
        "gen_ai.response.model": "claude-sonnet-4-5,claude-haiku-4-5",
      });

      // And the job's history gained exactly one entry for the ending check
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.events).toEqual([
        {
          at: expect.any(Date),
          kind: "check",
          runnerJobId: RUNNER_JOB_ID,
          runnerStatus: "succeeded",
          action: "saved_suggestions",
          savedCount: 1,
        },
      ]);
    },
  );

  dbIt(
    "counts only the rows saved in the history when the result names extra questions",
    async ({ db }) => {
      // Given a finished job whose result also grades a question that is not in the snapshot
      const { services, test } = await seedPendingRunnerJob(
        db,
        (questionId) => {
          const text = JSON.stringify({
            grades: [questionId, "not-in-the-snapshot"].map((id) => ({
              questionId: id,
              score: 85,
              feedback: "Fine.",
            })),
          });
          return async (input) => {
            const body = String(input).endsWith("?view=status")
              ? { status: "succeeded" }
              : runnerJobBody("succeeded", text);
            return new Response(JSON.stringify(body), { status: 200 });
          };
        },
      );

      // When the ending check runs
      await checkInSpan(services, test.id);

      // Then one row is saved and the history says one
      const rows = await db
        .collection("ai_grade")
        .find({ testId: test.id })
        .toArray();
      expect(rows).toHaveLength(1);
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.events).toEqual([
        expect.objectContaining({
          action: "saved_suggestions",
          savedCount: 1,
        }),
      ]);
    },
  );

  /**
   * A fake runner that answers each status read from `script` in turn.
   * @param script - `unreachable` fails the request; any other value is the status reported.
   */
  function scriptedFetch(script: string[]): FakeFetch {
    let call = 0;
    return async () => {
      const answer = script[call++] ?? "unreachable";
      if (answer === "unreachable") throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ status: answer }), { status: 200 });
    };
  }

  dbIt(
    "records every check on its span but adds one history entry per runner status change",
    async ({ db }) => {
      // Given a job the runner reports running, then unreachable twice, then running again
      // The provider builds a client per call, so one scripted fetch is shared.
      const runner = scriptedFetch([
        "running",
        "running",
        "running",
        "unreachable",
        "unreachable",
        "running",
      ]);
      const { services, test } = await seedPendingRunnerJob(db, () => runner);

      // When six checks run
      const spans = [];
      for (let i = 0; i < 6; i++)
        spans.push(await checkInSpan(services, test.id));

      // Then each check's span names the action it took
      expect(
        spans.map((span) => span?.attributes["lms.ai.runner.action"]),
      ).toEqual([
        "still_waiting",
        "still_waiting",
        "still_waiting",
        "skipped_unreachable",
        "skipped_unreachable",
        "still_waiting",
      ]);
      expect(spans[3]?.attributes["lms.ai.runner.unreachable_cause"]).toBe(
        "TypeError",
      );

      // And the history holds one entry per change of what the runner showed
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(
        job?.events.map((event) => [
          event.kind === "check" ? event.runnerStatus : null,
          event.action,
        ]),
      ).toEqual([
        ["running", "still_waiting"],
        ["unreachable", "skipped_unreachable"],
        ["running", "still_waiting"],
      ]);
    },
  );

  dbIt(
    "records a failed job's ending check with the runner's error kind",
    async ({ db }) => {
      // Given a job the runner reports failed
      const { services, test } = await seedPendingRunnerJob(
        db,
        () => async (input) =>
          new Response(
            JSON.stringify(
              String(input).endsWith("?view=status")
                ? { status: "failed" }
                : {
                    id: RUNNER_JOB_ID,
                    status: "failed",
                    result: null,
                    error: { kind: "claude_error", message: "private detail" },
                  },
            ),
            { status: 200 },
          ),
      );

      // When the check runs
      const span = await checkInSpan(services, test.id);

      // Then span and history carry the error kind but never its message
      expect(span?.attributes).toMatchObject({
        "lms.ai.runner.status": "failed",
        "lms.ai.runner.action": "marked_failed",
        "lms.ai.runner.error_kind": "claude_error",
      });
      expect(JSON.stringify(span?.attributes)).not.toContain("private detail");
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.events).toEqual([
        {
          at: expect.any(Date),
          kind: "check",
          runnerJobId: RUNNER_JOB_ID,
          runnerStatus: "failed",
          action: "marked_failed",
          errorKind: "claude_error",
        },
      ]);
    },
  );

  dbIt(
    "records claimed_elsewhere on the losing check's span and leaves the winner's entry alone",
    async ({ db }) => {
      // Given a finished job that another check ends between this check's reads
      let services: Awaited<
        ReturnType<typeof seedPendingRunnerJob>
      >["services"];
      const seeded = await seedPendingRunnerJob(db, (questionId) =>
        fakeRunnerFetch("succeeded", questionId, async (url) => {
          if (url.endsWith("?view=status")) return;
          await services.aiGradeJobService.claimFinal(
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
              savedCount: 1,
            },
          );
        }),
      );
      services = seeded.services;

      // When this check runs
      const span = await checkInSpan(services, seeded.test.id);

      // Then its span says it lost the claim
      expect(span?.attributes["lms.ai.runner.action"]).toBe(
        "claimed_elsewhere",
      );

      // And the history holds only the winner's entry
      const job = await services.aiGradeJobService.getLatestForStudent(
        seeded.test.id,
        "student-1",
      );
      expect(job?.events.map((event) => event.action)).toEqual([
        "saved_suggestions",
      ]);
    },
  );

  dbIt(
    "writes nothing to a job that is already final when a late still_waiting check arrives",
    async ({ db }) => {
      // Given a job that has ended
      const { services, test } = await seedPendingRunnerJob(db, (questionId) =>
        fakeRunnerFetch("succeeded", questionId),
      );
      await services.aiGradeService.collectRunnerResult(test.id, "student-1");

      // When a late check that saw running tries to record itself
      await services.aiGradeJobService.recordCheck(RUNNER_JOB_ID, {
        at: new Date(),
        kind: RunnerEventKind.Check,
        runnerJobId: RUNNER_JOB_ID,
        runnerStatus: "running",
        action: RunnerCheckAction.StillWaiting,
      });

      // Then the history still ends with the ending check
      const job = await services.aiGradeJobService.getLatestForStudent(
        test.id,
        "student-1",
      );
      expect(job?.events.map((event) => event.action)).toEqual([
        "saved_suggestions",
      ]);
    },
  );
});
