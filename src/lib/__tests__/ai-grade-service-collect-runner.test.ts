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
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

const RUNNER_JOB_ID = "0123456789abcdef01234567";
const RUNNER_URL = "https://runner.test";

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
 */
function fakeRunnerClient(status: string, questionId: string) {
  const text = readFileSync(
    "src/lib/ai/__tests__/fixtures/runner-result.txt",
    "utf8",
  ).replaceAll("QUESTION_ID", questionId);
  const fetchFake = vi.fn(async (input: string | URL | Request) => {
    const body = String(input).endsWith("?view=status")
      ? { status }
      : runnerJobBody(status, text);
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const client = new BackgroundClaudeRunnerClient(
    { url: RUNNER_URL, key: "bcr_svc_key" },
    { fetch: fetchFake, timeoutMs: { create: 50, read: 500 } },
  );
  return { client, fetchFake };
}

/**
 * Seeds a submitted student with one written answer and a pending runner job.
 * @param db - The test database.
 * @param status - What the fake runner reports for the job.
 */
async function seedPendingRunnerJob(db: Db, status: string) {
  await insertRawCourses(db, ["course-1"]);
  // The fake needs the question id the seeding creates, so the provider reads it lazily.
  let questionId = "";
  let runner = fakeRunnerClient(status, questionId);
  const services = buildCoreServices(db, {
    runnerClientProvider: () => {
      runner = fakeRunnerClient(status, questionId);
      return ready(runner.client);
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
  return {
    services,
    test,
    question,
    answer,
    runnerFetch: () => runner.fetchFake,
  };
}

describe("AiGradeService.collectRunnerResult - a succeeded runner job", () => {
  dbIt(
    "saves one Claude-labelled row per snapshot candidate and ends the job",
    async ({ db }) => {
      // Given a pending job the runner has finished
      const { services, test, question, answer } = await seedPendingRunnerJob(
        db,
        "succeeded",
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
