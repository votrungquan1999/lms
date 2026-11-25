import { AsyncLocalStorage } from "node:async_hooks";
import { Collection, type Db, MongoServerError } from "mongodb";
import { ensureIndexes } from "src/lib/database";
import type { SingleSelectQuestion } from "src/lib/question-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { insertRawCourses } from "src/tests/raw-enrollment-seeds";
import { describe, expect, it, vi } from "vitest";

const dbIt = withTestDb(it);

const T1 = new Date("2026-05-30T10:00:00.000Z");
const LIMIT = 30;

/**
 * Seeds a timed test (limit 30 min) started at T1 for "stu-1", with the
 * submission service's clock pinned to `now`.
 */
async function seedTimedTest(
  db: Db,
  now: Date | (() => Date),
  { indexes = true }: { indexes?: boolean } = {},
) {
  if (indexes) await ensureIndexes(db);
  await insertRawCourses(db, ["course-1"]);
  const core = buildCoreServices(db, {
    now: typeof now === "function" ? now : () => now,
  });
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
    answerRevealMode: "diff",
    updatedBy: "admin",
  });
  await core.testStartService.recordStart(test.id, "stu-1", T1);
  return { core, testId: test.id };
}

describe("TestSubmissionService — timed enforcement", () => {
  dbIt(
    "accepts a submit strictly past the deadline + grace as a hand-in at the deadline",
    async ({ db }) => {
      // Given a timed test (30 min) started at T1, clock at T1 + 30m + 60s + 1ms.
      const now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      const { core, testId } = await seedTimedTest(db, now);

      // When submitTest is called (the browser's late hand-in).
      await core.testSubmissionService.submitTest(testId, "stu-1");

      // Then one submission exists, stamped at the deadline.
      const submission = await core.testSubmissionService.getActiveSubmission(
        testId,
        "stu-1",
      );
      expect(submission?.submittedAt).toEqual(
        new Date(T1.getTime() + LIMIT * 60_000),
      );
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
    await insertRawCourses(db, ["course-1"]);
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

/** Adds a single-select question and saves a correct answer to it for "stu-1". */
async function answerOneQuestion(
  core: Awaited<ReturnType<typeof seedTimedTest>>["core"],
  testId: string,
) {
  const question = (await core.questionService.addQuestion(testId, {
    title: "Q?",
    content: "Choose.",
    createdBy: "admin",
    type: "single_select",
    options: [
      { text: "A", isCorrect: false },
      { text: "B", isCorrect: true },
    ],
  })) as SingleSelectQuestion;
  const correctId = question.options.find((o) => o.isCorrect)?.id ?? "";
  await core.answerService.submitAnswer({
    testId,
    questionId: question.id,
    studentId: "stu-1",
    answer: { type: "mc", selectedIds: [correctId] },
  });
  return question.id;
}

describe("TestSubmissionService — server hand-in of an expired attempt", () => {
  dbIt(
    "hands in the saved answers at the deadline and grades them",
    async ({ db }) => {
      // Given a saved answer from inside the limit, and the clock one millisecond past deadline + grace
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      const questionId = await answerOneQuestion(core, testId);
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);

      // When the server hands the attempt in
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then the submission is stamped at the deadline, not at the open time
      const submission = await core.testSubmissionService.getActiveSubmission(
        testId,
        "stu-1",
      );
      expect(submission?.submittedAt).toEqual(
        new Date(T1.getTime() + LIMIT * 60_000),
      );

      // And the saved answer is graded
      const grade = await core.gradeService.getGrade(
        testId,
        questionId,
        "stu-1",
      );
      expect(grade?.score).toBe(100);
    },
  );

  dbIt(
    "replaces the old hand-in and resolves the redo for a student stuck in a redo with an expired start",
    async ({ db }) => {
      // Given a handed-in attempt, a redo the teacher requested, and an old start whose time ran out
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      const questionId = await answerOneQuestion(core, testId);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);

      // When the server hands the attempt in
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then one active hand-in remains, stamped at the deadline
      const rows = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      const active = rows.filter((r) => r.deletedAt === null);
      expect(rows).toHaveLength(2);
      expect(active).toHaveLength(1);
      expect(active[0].submittedAt).toEqual(
        new Date(T1.getTime() + LIMIT * 60_000),
      );

      // And the redo is resolved and the answer graded
      expect(
        await core.redoRequestService.getActiveRedoRequest(testId, "stu-1"),
      ).toBeNull();
      expect(
        (await core.gradeService.getGrade(testId, questionId, "stu-1"))?.score,
      ).toBe(100);
    },
  );

  dbIt(
    "gives the replacement hand-in no release when the replaced one was released to the student",
    async ({ db }) => {
      // Given a hand-in released to the student, then a redo whose start has expired
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.testSubmissionService.releaseGradeToStudent(
        testId,
        "stu-1",
        "admin",
      );
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);

      // When the server hands the attempt in
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then the new active hand-in is not released
      const active = await core.testSubmissionService.getActiveSubmission(
        testId,
        "stu-1",
      );
      expect(active?.releasedAt).toBeNull();
      expect(active?.releasedBy).toBeNull();

      // And the replaced hand-in keeps its release audit
      const history = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1", deletedAt: { $ne: null } })
        .toArray();
      expect(history).toHaveLength(1);
      expect(history[0].releasedBy).toBe("admin");
    },
  );

  dbIt(
    "replaces only the active hand-in on a second redo, leaving earlier history rows untouched",
    async ({ db }) => {
      // Given a first redo cycle already replaced the hand-in once, leaving one history row
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");
      const submissions = db.collection("test_submission");
      const before = await submissions
        .find({ testId, studentId: "stu-1" })
        .toArray();
      const oldHistory = before.find((r) => r.deletedAt !== null);
      const activeBefore = before.find((r) => r.deletedAt === null);

      // When a second redo is requested and its expired attempt is handed in
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then the first cycle's history row is exactly as it was
      const after = await submissions
        .find({ testId, studentId: "stu-1" })
        .toArray();
      expect(after.find((r) => r.id === oldHistory?.id)).toEqual(oldHistory);

      // And the previously active row became history, with one new active row
      expect(after).toHaveLength(3);
      const active = after.filter((r) => r.deletedAt === null);
      expect(active).toHaveLength(1);
      expect(active[0].id).not.toBe(activeBefore?.id);
      expect(
        after.find((r) => r.id === activeBefore?.id)?.deletedAt,
      ).not.toBeNull();
    },
  );

  dbIt(
    "hands in nothing during the grace minute after the deadline",
    async ({ db }) => {
      // Given a saved answer and the clock exactly at deadline + grace (not strictly past)
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await answerOneQuestion(core, testId);
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000);

      // When the server checks the attempt
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then no hand-in exists yet, leaving the minute to the browser's own hand-in
      expect(
        await core.testSubmissionService.isTestSubmitted(testId, "stu-1"),
      ).toBe(false);
    },
  );

  dbIt(
    "hands in a blank attempt as a submission with no answers",
    async ({ db }) => {
      // Given a started attempt with no saved answers, long past its deadline
      const now = new Date(T1.getTime() + 3 * LIMIT * 60_000);
      const { core, testId } = await seedTimedTest(db, now);

      // When the server hands the attempt in
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then it is handed in at the deadline
      const submission = await core.testSubmissionService.getActiveSubmission(
        testId,
        "stu-1",
      );
      expect(submission?.submittedAt).toEqual(
        new Date(T1.getTime() + LIMIT * 60_000),
      );
    },
  );

  dbIt("hands in a practice attempt without grading it", async ({ db }) => {
    // Given a practice timed test with a saved answer, past its deadline
    let now = new Date(T1.getTime() + 10 * 60_000);
    const { core, testId } = await seedTimedTest(db, () => now);
    // Settings refuse a timed practice test, so legacy data is seeded directly.
    await db
      .collection("test")
      .updateOne({ id: testId }, { $set: { isPractice: true } });
    const questionId = await answerOneQuestion(core, testId);
    now = new Date(T1.getTime() + 3 * LIMIT * 60_000);

    // When the server hands the attempt in
    await core.testSubmissionService.handInIfExpired(testId, "stu-1");

    // Then it is handed in, with no grade
    expect(
      await core.testSubmissionService.isTestSubmitted(testId, "stu-1"),
    ).toBe(true);
    expect(
      await core.gradeService.getGrade(testId, questionId, "stu-1"),
    ).toBeNull();
  });

  dbIt("does nothing when called again after the hand-in", async ({ db }) => {
    // Given an attempt the server already handed in, whose auto-grade the teacher then changed
    let now = new Date(T1.getTime() + 10 * 60_000);
    const { core, testId } = await seedTimedTest(db, () => now);
    const questionId = await answerOneQuestion(core, testId);
    now = new Date(T1.getTime() + 3 * LIMIT * 60_000);
    await core.testSubmissionService.handInIfExpired(testId, "stu-1");
    await core.gradeService.gradeQuestion({
      testId,
      questionId,
      studentId: "stu-1",
      score: 50,
      feedback: "",
      gradedBy: "admin",
    });

    // When the server is asked again
    await core.testSubmissionService.handInIfExpired(testId, "stu-1");

    // Then there is still one hand-in row, at the deadline
    const rows = await db
      .collection("test_submission")
      .find({ testId, studentId: "stu-1" })
      .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].submittedAt).toEqual(
      new Date(T1.getTime() + LIMIT * 60_000),
    );

    // And the teacher's grade is not overwritten by a second auto-grade
    expect(
      (await core.gradeService.getGrade(testId, questionId, "stu-1"))?.score,
    ).toBe(50);
  });

  dbIt(
    "hands in an expired redo attempt once when several pages load at the same moment",
    async ({ db }) => {
      // Given a student whose redo attempt (started at T2) ran out, with an older hand-in still on record
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await answerOneQuestion(core, testId);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      await core.testStartService.clearActiveStart(testId, "stu-1", "admin");
      const T2 = new Date(T1.getTime() + 60 * 60_000);
      await core.testStartService.recordStart(testId, "stu-1", T2);
      now = new Date(T2.getTime() + LIMIT * 60_000 + 60_000 + 1);
      const autoGrade = vi.spyOn(core.gradeService, "autoGradeTest");

      // When five pages ask for the hand-in at once
      await Promise.all(
        Array.from({ length: 5 }, () =>
          core.testSubmissionService.handInIfExpired(testId, "stu-1"),
        ),
      );

      // Then one active hand-in at the redo deadline, replacing only the older one
      const rows = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      expect(rows.filter((r) => r.deletedAt === null)).toHaveLength(1);
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.deletedAt === null)?.submittedAt).toEqual(
        new Date(T2.getTime() + LIMIT * 60_000),
      );

      // And the redo is resolved and the answers are graded once
      expect(
        await core.redoRequestService.getActiveRedoRequest(testId, "stu-1"),
      ).toBeNull();
      expect(autoGrade).toHaveBeenCalledTimes(1);
    },
  );

  dbIt(
    "leaves the winner's hand-in untouched when a redo hand-in loses the claim",
    async ({ db }) => {
      // Given an expired redo attempt that one page already handed in, replacing the old hand-in
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await answerOneQuestion(core, testId);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");
      const before = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      const autoGrade = vi.spyOn(core.gradeService, "autoGradeTest");

      // When a second page, which read the redo before it was claimed, hands in
      vi.spyOn(
        core.redoRequestService,
        "getActiveRedoRequest",
      ).mockResolvedValueOnce({
        id: "stale-redo",
        testId,
        studentId: "stu-1",
        requestedBy: "admin",
        requestedAt: new Date(),
        resolvedAt: null,
      });
      await core.testSubmissionService.handInIfExpired(testId, "stu-1");

      // Then the rows are exactly as the winner left them, and nothing is graded again
      const after = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      expect(after).toEqual(before);
      expect(autoGrade).not.toHaveBeenCalled();
    },
  );

  dbIt(
    "does not grade when its insert is refused as a duplicate of another page's hand-in",
    async ({ db }) => {
      // Given an expired attempt with no hand-in yet, and a grading spy
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now);
      await answerOneQuestion(core, testId);
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      const autoGrade = vi.spyOn(core.gradeService, "autoGradeTest");

      // And another page's hand-in lands first, so this page's insert hits the unique index
      const realUpdateOne = Collection.prototype.updateOne;
      const updateOne = vi
        .spyOn(Collection.prototype, "updateOne")
        .mockImplementation(async function (
          this: Collection,
          ...args: Parameters<Collection["updateOne"]>
        ) {
          if (this.collectionName !== "test_submission") {
            return realUpdateOne.apply(this, args);
          }
          await realUpdateOne.apply(this, args);
          throw new MongoServerError({
            message: "E11000 duplicate key error",
            code: 11000,
          });
        });

      // When this page hands in
      try {
        await core.testSubmissionService.handInIfExpired(testId, "stu-1");
      } finally {
        updateOne.mockRestore();
      }

      // Then there is one hand-in row, and this page did not grade it
      const rows = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      expect(rows).toHaveLength(1);
      expect(autoGrade).not.toHaveBeenCalled();
    },
  );

  dbIt(
    "keeps one active hand-in and grades once when a late page arrives mid-swap, even without the unique index",
    async ({ db }) => {
      // Given a handed-in attempt, an open redo and an expired start, with no unique index to fall back on
      let now = new Date(T1.getTime() + 10 * 60_000);
      const { core, testId } = await seedTimedTest(db, () => now, {
        indexes: false,
      });
      await answerOneQuestion(core, testId);
      await core.testSubmissionService.submitTest(testId, "stu-1");
      await core.redoRequestService.requestRedo(testId, "stu-1", "admin");
      now = new Date(T1.getTime() + LIMIT * 60_000 + 60_000 + 1);
      const autoGrade = vi.spyOn(core.gradeService, "autoGradeTest");

      // And page 0 (the claim winner) is held after its first write to swap the hand-in,
      // while page 1 only reads the redo after that write and checks the hand-in before page 0 continues
      const page = new AsyncLocalStorage<number>();
      const signal = () => {
        let release!: () => void;
        const done = new Promise<void>((resolve) => {
          release = resolve;
        });
        return { done, release };
      };
      let lateSawSubmitted: boolean | undefined;
      const swapStarted = signal();
      const lateChecked = signal();
      const realGetRedo = core.redoRequestService.getActiveRedoRequest.bind(
        core.redoRequestService,
      );
      vi.spyOn(
        core.redoRequestService,
        "getActiveRedoRequest",
      ).mockImplementation(async (...args) => {
        if (page.getStore() === 1) await swapStarted.done;
        return realGetRedo(...args);
      });
      const realIsSubmitted = core.testSubmissionService.isTestSubmitted.bind(
        core.testSubmissionService,
      );
      vi.spyOn(
        core.testSubmissionService,
        "isTestSubmitted",
      ).mockImplementation(async (...args) => {
        const result = await realIsSubmitted(...args);
        if (page.getStore() === 1) {
          lateSawSubmitted = result;
          lateChecked.release();
        }
        return result;
      });
      let page0Writes = 0;
      for (const method of [
        "updateMany",
        "updateOne",
        "findOneAndUpdate",
        "insertOne",
      ] as const) {
        const real = Collection.prototype[method] as (
          ...a: unknown[]
        ) => Promise<unknown>;
        vi.spyOn(Collection.prototype, method).mockImplementation(
          async function (this: Collection, ...args: unknown[]) {
            if (
              this.collectionName !== "test_submission" ||
              page.getStore() !== 0
            ) {
              return real.apply(this, args);
            }
            if (page0Writes++ > 0) await lateChecked.done;
            const result = await real.apply(this, args);
            swapStarted.release();
            return result;
          } as never,
        );
      }

      // When both pages hand in
      let grades = 0;
      try {
        await Promise.all(
          [0, 1].map((id) =>
            page.run(id, () =>
              core.testSubmissionService.handInIfExpired(testId, "stu-1"),
            ),
          ),
        );
        grades = autoGrade.mock.calls.length;
      } finally {
        vi.restoreAllMocks();
      }

      // Then the late page saw a hand-in even mid-swap, exactly one is active and the answers were graded once
      expect(lateSawSubmitted).toBe(true);
      const rows = await db
        .collection("test_submission")
        .find({ testId, studentId: "stu-1" })
        .toArray();
      expect(rows.filter((r) => r.deletedAt === null)).toHaveLength(1);
      expect(grades).toBe(1);
    },
  );
});
