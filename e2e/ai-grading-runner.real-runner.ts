/**
 * Show-me run: AI grading through the REAL background Claude runner (one paid job).
 *
 * `pnpm test:e2e:real-runner` — see `playwright.real-runner.config.ts` for the
 * prerequisites. Seeds a submitted answer, clicks Auto-grade with AI and waits for
 * the page's own refresh to bring the suggestion; it never reloads. The job row,
 * the runner's full job and the saved suggestions land in `tmp/real-ai-runs/`
 * BEFORE any assertion, so a failed run is diagnosed from that file, not rerun.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { MongoClient } from "mongodb";
import { E2E_MONGODB_URI } from "./mongodb-uri";
import { readRunnerEnvFile } from "./real-runner-env";
import {
  enroll,
  insertAnswer,
  insertCourse,
  insertQuestion,
  insertStudent,
  insertTest,
  withDb,
} from "./seed";

const ENV_FILE =
  process.env.REAL_RUNNER_ENV_FILE ?? ".env.e2e-real-runner.local";
const RUNS_DIR = path.join(__dirname, "../tmp/real-ai-runs");
const RESULT_TIMEOUT_MS = 1_200_000;

/** The ids the spec seeds. */
interface SeedIds {
  courseId: string;
  testId: string;
  studentId: string;
  questionId: string;
}

/** What one run writes to disk. */
interface RunnerRun {
  seed: SeedIds | null;
  jobRow: unknown;
  runnerJob: unknown;
  suggestions: unknown[];
  costUSD: number | null;
}

/** One entry of the runner job's `usage` array, as far as this spec sums it. */
interface RunnerUsageEntry {
  costUSD: number;
}

/**
 * Writes the run record next to the screenshot.
 * @param runFile - The JSON path for this run.
 * @param run - The record so far.
 */
function saveRun(runFile: string, run: RunnerRun): void {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(runFile, JSON.stringify(run, null, 2));
}

test.describe("AI grading — real runner", () => {
  test("a teacher starts Auto-grade and the runner's suggestion lands on its own", async ({
    page,
  }) => {
    const runId = process.env.AI_USAGE_RUN_ID ?? "no-run-id";
    const runFile = path.join(RUNS_DIR, `${runId}-runner.json`);
    const run: RunnerRun = {
      seed: null,
      jobRow: null,
      runnerJob: null,
      suggestions: [],
      costUSD: null,
    };

    // Seed a submitted free-text answer.
    const seed = await withDb(async (db) => {
      const courseId = await insertCourse(db, { title: "Runner show-me" });
      const studentId = await insertStudent(db, { name: "Runner Student" });
      await enroll(db, { courseId, studentId });
      const testId = await insertTest(db, courseId, {
        title: "Runner show-me test",
      });
      const questionId = await insertQuestion(db, testId, {
        title: "Recursion",
        content: "Explain recursion in one or two sentences.",
        referenceAnswer:
          "A function that calls itself until a base case stops it.",
      });
      await insertAnswer(db, {
        testId,
        questionId,
        studentId,
        answer: {
          type: "free_text",
          text: "Recursion is when a function calls itself. It needs a stopping condition.",
        },
      });
      await db.collection("test_submission").insertOne({
        id: crypto.randomUUID(),
        testId,
        studentId,
        submittedAt: new Date(),
      });
      return { courseId, testId, studentId, questionId };
    });
    run.seed = seed;
    saveRun(runFile, run);

    // Start the round and see it queued.
    await page.goto(
      `/admin/grading/${seed.testId}?studentId=${seed.studentId}`,
    );
    await page.getByRole("button", { name: /More/ }).click();
    await page.getByRole("menuitem", { name: "Auto-grade with AI" }).click();
    // The in-progress note replaces the one-off "started" message once the page re-renders.
    await expect(page.getByTestId("ai-grading-in-progress")).toBeVisible();

    // The page's own refresh brings the suggestion; no reload here.
    const suggestionRow = page.getByTestId("ai-suggestion-row");
    await suggestionRow
      .waitFor({ timeout: RESULT_TIMEOUT_MS })
      .catch(() => undefined);

    // Record everything before asserting anything.
    const client = new MongoClient(E2E_MONGODB_URI);
    try {
      const db = client.db();
      run.jobRow = await db
        .collection("ai_grade_job")
        .findOne({ studentId: seed.studentId }, { projection: { _id: 0 } });
      run.suggestions = await db
        .collection("ai_grade")
        .find({ studentId: seed.studentId }, { projection: { _id: 0 } })
        .sort({ generatedAt: 1, id: 1 })
        .toArray();
    } finally {
      await client.close();
    }
    // Saved now, so a failed runner read below still leaves the LMS rows on disk.
    saveRun(runFile, run);
    const runnerJobId = (run.jobRow as { runnerJobId?: string } | null)
      ?.runnerJobId;
    if (runnerJobId) {
      const { url, key } = readRunnerEnvFile(ENV_FILE);
      const response = await fetch(`${url}/api/jobs/${runnerJobId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      run.runnerJob = await response.json();
      const usage = (run.runnerJob as { usage?: RunnerUsageEntry[] | null })
        .usage;
      run.costUSD = (usage ?? []).reduce((sum, u) => sum + u.costUSD, 0);
    }
    saveRun(runFile, run);
    await page.screenshot({
      path: runFile.replace(/\.json$/, "-page.png"),
      fullPage: true,
    });

    // Soft assertions, so one paid run reports every failure.
    expect.soft(run.suggestions).toHaveLength(1);
    for (const suggestion of run.suggestions as {
      model: string;
      score: number;
      feedback: string;
    }[]) {
      expect.soft(suggestion.model).toBe("claude-sonnet");
      expect.soft(suggestion.score).toBeGreaterThanOrEqual(0);
      expect.soft(suggestion.score).toBeLessThanOrEqual(100);
      expect.soft(suggestion.feedback.length).toBeGreaterThan(0);
    }
    expect
      .soft((run.jobRow as { status?: string } | null)?.status)
      .toBe("succeeded");
    await expect.soft(suggestionRow).toBeVisible();
  });
});
