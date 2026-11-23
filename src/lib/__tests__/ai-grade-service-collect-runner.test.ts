import { readFileSync } from "node:fs";
import type { Db } from "mongodb";
import { BackgroundClaudeRunnerClient } from "src/lib/ai/background-claude-runner-client";
import { ready } from "src/lib/ai/runner-settings";
import {
  AiGradeJobStatus,
  AiGradeJobTrigger,
} from "src/lib/ai-grade-job-service";
import { CollectOutcomeKind } from "src/lib/ai-grade-types";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const RUNNER_JOB_ID = "0123456789abcdef01234567";
const RUNNER_URL = "https://runner.test";

/** A fetch the fake runner answers with. */
type FakeFetch = (input: string | URL | Request) => Promise<Response>;

/** Builds the full runner job the fake runner returns. */
function runnerJobBody(status: string, resultText: string) {
  return {
    id: RUNNER_JOB_ID,
    status,
    result: { text: resultText, durationMs: 1, numTurns: 1, sessionId: "s" },
    error: null,
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
 */
async function seedPendingRunnerJob(
  db: Db,
  makeFetch: (questionId: string) => FakeFetch,
) {
  await insertRawCourses(db, ["course-1"]);
  // The fake names the seeded question, so the provider reads its id lazily.
  let questionId = "";
  const services = buildCoreServices(db, {
    runnerClientProvider: () =>
      ready(
        new BackgroundClaudeRunnerClient(
          { url: RUNNER_URL, key: "bcr_svc_key" },
          {
            fetch: makeFetch(questionId),
            timeoutMs: { create: 50, read: 2000 },
          },
        ),
      ),
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
  await services.aiGradeJobService.create({
    courseId: "course-1",
    testId: test.id,
    studentId: "student-1",
    questionId: null,
    trigger: AiGradeJobTrigger.AutoGrade,
    runnerJobId: RUNNER_JOB_ID,
    candidates: [{ questionId: question.id, answerId: answer.id }],
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
