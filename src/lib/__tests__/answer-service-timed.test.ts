import type { Db } from "mongodb";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const T1 = new Date("2026-05-30T10:00:00.000Z");
const LIMIT = 30;

/**
 * Creates a timed test (limit 30 min) started at T1 for "stu-1", and returns a
 * helper to build a services bundle whose clock is pinned to a given instant.
 */
async function seedTimedTest(db: Db) {
  const setup = buildCoreServices(db);
  const test = await setup.testService.createTest("course-1", {
    title: "Timed",
    description: "",
    createdBy: "admin",
  });
  await setup.testService.updateTestSettings(test.id, {
    showGradeAfterSubmit: true,
    showCorrectAnswerAfterSubmit: true,
    timeLimitMinutes: LIMIT,
    isPractice: false,
    updatedBy: "admin",
  });
  await setup.testStartService.recordStart(test.id, "stu-1", T1);
  const at = (now: Date) => buildCoreServices(db, { now: () => now });
  return { testId: test.id, at };
}

async function writeAnswer(
  core: ReturnType<typeof buildCoreServices>,
  testId: string,
  text: string,
) {
  return core.answerService.submitAnswer({
    testId,
    questionId: "q-1",
    studentId: "stu-1",
    answer: { type: "free_text", text },
  });
}

describe("AnswerService — timed enforcement", () => {
  dbIt(
    "rejects an answer write past the deadline + grace and leaves the prior answer unchanged",
    async ({ db }) => {
      const { testId, at } = await seedTimedTest(db);
      // Given a prior answer saved within the limit.
      await writeAnswer(
        at(new Date(T1.getTime() + 5 * 60_000)),
        testId,
        "first",
      );

      // When a new answer is written strictly past the deadline + grace.
      const late = at(new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1));
      await expect(writeAnswer(late, testId, "second")).rejects.toThrow();

      // Then the previously-saved answer is unchanged.
      const answers = await late.answerService.getLatestAnswers(
        testId,
        "stu-1",
      );
      expect(answers).toHaveLength(1);
      expect(answers[0].answer).toEqual({ type: "free_text", text: "first" });
    },
  );

  dbIt("accepts an answer write within the time limit", async ({ db }) => {
    const { testId, at } = await seedTimedTest(db);
    // When an answer is written at T1 + 5 min (within the limit).
    const core = at(new Date(T1.getTime() + 5 * 60_000));
    await writeAnswer(core, testId, "within");

    // Then the write is persisted.
    const answers = await core.answerService.getLatestAnswers(testId, "stu-1");
    expect(answers[0].answer).toEqual({ type: "free_text", text: "within" });
  });

  dbIt("accepts an answer write inside the grace window", async ({ db }) => {
    const { testId, at } = await seedTimedTest(db);
    // When an answer is written at T1 + 30 min + 30 s (inside grace).
    const core = at(new Date(T1.getTime() + LIMIT * 60_000 + 30_000));
    await writeAnswer(core, testId, "grace");

    // Then the write is accepted.
    const answers = await core.answerService.getLatestAnswers(testId, "stu-1");
    expect(answers[0].answer).toEqual({ type: "free_text", text: "grace" });
  });

  dbIt("never rejects an answer write on an untimed test", async ({ db }) => {
    // Given an untimed test, started at T1, clock far in the future.
    const setup = buildCoreServices(db);
    const test = await setup.testService.createTest("course-1", {
      title: "Untimed",
      description: "",
      createdBy: "admin",
    });
    await setup.testStartService.recordStart(test.id, "stu-1", T1);
    const far = new Date(T1.getTime() + 1000 * 24 * 60 * 60_000);
    const core = buildCoreServices(db, { now: () => far });

    // When an answer is written, then it is accepted.
    await writeAnswer(core, test.id, "anytime");
    const answers = await core.answerService.getLatestAnswers(test.id, "stu-1");
    expect(answers[0].answer).toEqual({ type: "free_text", text: "anytime" });
  });
});
