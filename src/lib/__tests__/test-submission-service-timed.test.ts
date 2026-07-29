import type { Db } from "mongodb";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const T1 = new Date("2026-05-30T10:00:00.000Z");
const LIMIT = 30;

/**
 * Seeds a timed test (limit 30 min) started at T1 for "stu-1", with the
 * submission service's clock pinned to `now`.
 */
async function seedTimedTest(db: Db, now: Date) {
  const core = buildCoreServices(db, { now: () => now });
  const test = await core.testService.createTest("course-1", {
    title: "Timed",
    description: "",
    createdBy: "admin",
  });
  await core.testService.updateTestSettings(test.id, {
    showGradeAfterSubmit: true,
    showCorrectAnswerAfterSubmit: true,
    timeLimitMinutes: LIMIT,
    isPractice: false,
    updatedBy: "admin",
  });
  await core.testStartService.recordStart(test.id, "stu-1", T1);
  return { core, testId: test.id };
}

describe("TestSubmissionService — timed enforcement", () => {
  dbIt(
    "rejects a submit strictly past the deadline + grace and persists nothing",
    async ({ db }) => {
      // Given a timed test (30 min) started at T1, clock at T1 + 30m + 60s + 1ms.
      const now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      const { core, testId } = await seedTimedTest(db, now);

      // When submitTest is called.
      // Then it is rejected and no submission is persisted.
      await expect(
        core.testSubmissionService.submitTest(testId, "stu-1"),
      ).rejects.toThrow();
      expect(
        await core.testSubmissionService.isTestSubmitted(testId, "stu-1"),
      ).toBe(false);
    },
  );

  dbIt("accepts a submit well within the time limit", async ({ db }) => {
    // Given the clock at T1 + 10 min (within the 30 min limit).
    const now = new Date(T1.getTime() + 10 * 60_000);
    const { core, testId } = await seedTimedTest(db, now);

    // When submitTest is called, then it succeeds.
    await core.testSubmissionService.submitTest(testId, "stu-1");
    expect(
      await core.testSubmissionService.isTestSubmitted(testId, "stu-1"),
    ).toBe(true);
  });

  dbIt(
    "accepts an at-zero submit that lands inside the grace window",
    async ({ db }) => {
      // Given the clock at T1 + 30 min + 30 s (past the limit, inside grace).
      const now = new Date(T1.getTime() + LIMIT * 60_000 + 30_000);
      const { core, testId } = await seedTimedTest(db, now);

      // When submitTest is called, then it succeeds (grace absorbs the lag).
      await core.testSubmissionService.submitTest(testId, "stu-1");
      expect(
        await core.testSubmissionService.isTestSubmitted(testId, "stu-1"),
      ).toBe(true);
    },
  );

  dbIt("never rejects an untimed test no matter how late", async ({ db }) => {
    // Given an untimed test and a clock far in the future.
    const far = new Date(T1.getTime() + 1000 * 24 * 60 * 60_000);
    const core = buildCoreServices(db, { now: () => far });
    const test = await core.testService.createTest("course-1", {
      title: "Untimed",
      description: "",
      createdBy: "admin",
    });
    await core.testStartService.recordStart(test.id, "stu-1", T1);

    // When submitTest is called, then it succeeds (no deadline applies).
    await core.testSubmissionService.submitTest(test.id, "stu-1");
    expect(
      await core.testSubmissionService.isTestSubmitted(test.id, "stu-1"),
    ).toBe(true);
  });

  dbIt(
    "preserves already-submitted idempotency when a late duplicate arrives",
    async ({ db }) => {
      // Given a test submitted within the limit.
      const now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, now);
      await core.testSubmissionService.submitTest(testId, "stu-1");

      // When submitTest is called again, then the existing "already submitted"
      // guard still resolves the manual-vs-auto race to a single submission.
      await expect(
        core.testSubmissionService.submitTest(testId, "stu-1"),
      ).rejects.toThrow(/already been submitted/i);
    },
  );
});
