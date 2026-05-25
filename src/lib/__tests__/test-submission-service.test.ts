/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import type {
  MultiSelectQuestion,
  SingleSelectQuestion,
} from "src/lib/question-service";
import { TestStatusService } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("TestSubmissionService - Integration Tests", () => {
  dbIt(
    "should auto-grade single_select as 100 when selection matches, 0 when wrong, triggered on submitTest",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);

      const question = (await questionService.addQuestion("test-1", {
        title: "Q?",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: false },
          { text: "B", isCorrect: true },
        ],
      })) as SingleSelectQuestion;

      const correctId = question.options.find((o) => o.isCorrect)?.id ?? "";
      const wrongId = question.options.find((o) => !o.isCorrect)?.id ?? "";

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [correctId] },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-2",
        answer: { type: "mc", selectedIds: [wrongId] },
      });

      await testSubmissionService.submitTest("test-1", "student-1");
      await testSubmissionService.submitTest("test-1", "student-2");

      const gradeCorrect = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-1",
      );
      const gradeWrong = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-2",
      );

      expect(gradeCorrect?.score).toBe(100);
      expect(gradeWrong?.score).toBe(0);
    },
  );

  dbIt(
    "should auto-grade multi_select (all_or_nothing) as 100 for exact match, 0 otherwise",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);

      const question = (await questionService.addQuestion("test-1", {
        title: "Q?",
        content: "Select all that apply.",
        createdBy: "admin-1",
        type: "multi_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
          { text: "C", isCorrect: false },
        ],
        mcGradingStrategy: "all_or_nothing",
      })) as MultiSelectQuestion;

      const optA = question.options.find((o) => o.text === "A")?.id ?? "";
      const optB = question.options.find((o) => o.text === "B")?.id ?? "";
      const optC = question.options.find((o) => o.text === "C")?.id ?? "";

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [optA, optB] },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-2",
        answer: { type: "mc", selectedIds: [optA] },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-3",
        answer: { type: "mc", selectedIds: [optA, optB, optC] },
      });

      await testSubmissionService.submitTest("test-1", "student-1");
      await testSubmissionService.submitTest("test-1", "student-2");
      await testSubmissionService.submitTest("test-1", "student-3");

      const grade1 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-1",
      );
      const grade2 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-2",
      );
      const grade3 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-3",
      );

      expect(grade1?.score).toBe(100); // Exact match
      expect(grade2?.score).toBe(0); // Partial but strategy is all_or_nothing
      expect(grade3?.score).toBe(0); // Includes incorrect option
    },
  );

  dbIt(
    "should auto-grade multi_select (partial) proportionally minus deduction for wrong selections",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);

      const question = (await questionService.addQuestion("test-1", {
        title: "Q Options?",
        content: "Select all correct.",
        createdBy: "admin-1",
        type: "multi_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
          { text: "C", isCorrect: true },
          { text: "D", isCorrect: false },
        ],
        mcGradingStrategy: "partial",
      })) as MultiSelectQuestion;

      const optA = question.options.find((o) => o.text === "A")?.id ?? "";
      const optB = question.options.find((o) => o.text === "B")?.id ?? "";
      const optC = question.options.find((o) => o.text === "C")?.id ?? "";
      const optD = question.options.find((o) => o.text === "D")?.id ?? "";

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [optA, optB] }, // 2 correct, 0 wrong → 67
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-2",
        answer: { type: "mc", selectedIds: [optA, optB, optC] }, // 3 correct, 0 wrong → 100
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-3",
        answer: { type: "mc", selectedIds: [optA, optB, optD] }, // 2 correct, 1 wrong → 33
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-4",
        answer: { type: "mc", selectedIds: [optD] }, // 0 correct, 1 wrong → 0
      });

      await testSubmissionService.submitTest("test-1", "student-1");
      await testSubmissionService.submitTest("test-1", "student-2");
      await testSubmissionService.submitTest("test-1", "student-3");
      await testSubmissionService.submitTest("test-1", "student-4");

      const grade1 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-1",
      );
      const grade2 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-2",
      );
      const grade3 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-3",
      );
      const grade4 = await gradeService.getGrade(
        "test-1",
        question.id,
        "student-4",
      );

      expect(grade1?.score).toBe(67);
      expect(grade2?.score).toBe(100);
      expect(grade3?.score).toBe(33);
      expect(grade4?.score).toBe(0);
    },
  );

  dbIt(
    "should only auto-grade multiple choice questions and leave free-text questions ungraded in a mixed test",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);
      const testStatusService = new TestStatusService(
        answerService,
        testSubmissionService,
        gradeService,
      );

      const questionMC = (await questionService.addQuestion("test-mix", {
        title: "Q MC",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;

      const questionFree = await questionService.addQuestion("test-mix", {
        title: "Q Free",
        content: "Write.",
        createdBy: "admin-1",
        type: "free_text",
      });

      const optA = questionMC.options.find((o) => o.text === "A")?.id ?? "";

      await answerService.submitAnswer({
        testId: "test-mix",
        questionId: questionMC.id,
        studentId: "student-mix",
        answer: { type: "mc", selectedIds: [optA] },
      });
      await answerService.submitAnswer({
        testId: "test-mix",
        questionId: questionFree.id,
        studentId: "student-mix",
        answer: { type: "free_text", text: "my long answer" },
      });

      await testSubmissionService.submitTest("test-mix", "student-mix");

      const gradeMC = await gradeService.getGrade(
        "test-mix",
        questionMC.id,
        "student-mix",
      );
      const gradeFree = await gradeService.getGrade(
        "test-mix",
        questionFree.id,
        "student-mix",
      );

      expect(gradeMC?.score).toBe(100);
      expect(gradeFree).toBeNull(); // Still ungraded

      const status = await testStatusService.getStatus(
        "test-mix",
        "student-mix",
        2,
      );
      expect(status).toBe("submitted"); // NOT Graded yet
    },
  );
});

describe("TestSubmissionService - Soft Delete", () => {
  dbIt(
    "deleteSubmission clears submitted state and lets the student resubmit",
    async ({ db }) => {
      const { questionService, answerService, testSubmissionService } =
        buildCoreServices(db);

      const question = (await questionService.addQuestion("test-soft", {
        title: "Q?",
        content: "Pick.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;
      const correctId = question.options.find((o) => o.isCorrect)!.id;

      await answerService.submitAnswer({
        testId: "test-soft",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [correctId] },
      });
      await testSubmissionService.submitTest("test-soft", "student-1");
      expect(
        await testSubmissionService.isTestSubmitted("test-soft", "student-1"),
      ).toBe(true);

      // Soft-delete the submission (redo flow).
      await testSubmissionService.deleteSubmission("test-soft", "student-1");

      // The student is no longer "submitted" from the caller's perspective.
      expect(
        await testSubmissionService.isTestSubmitted("test-soft", "student-1"),
      ).toBe(false);

      // Resubmitting succeeds and the student is "submitted" again.
      await testSubmissionService.submitTest("test-soft", "student-1");
      expect(
        await testSubmissionService.isTestSubmitted("test-soft", "student-1"),
      ).toBe(true);
    },
  );

  dbIt(
    "legacy rows inserted without a `deletedAt` field are treated as active",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      // Direct insert simulates a pre-migration row produced by an older
      // version of the service that didn't yet write `deletedAt`.
      await db.collection("test_submission").insertOne({
        id: "legacy-1",
        testId: "test-legacy",
        studentId: "student-legacy",
        submittedAt: new Date(),
      });

      // Mongo's `{ deletedAt: null }` equality matches missing fields, so the
      // legacy row should still register as "submitted".
      expect(
        await testSubmissionService.isTestSubmitted(
          "test-legacy",
          "student-legacy",
        ),
      ).toBe(true);

      // And the duplicate-check in submitTest should also see the legacy row,
      // so re-submission still rejects.
      await expect(
        testSubmissionService.submitTest("test-legacy", "student-legacy"),
      ).rejects.toThrow("already been submitted");

      // getActiveSubmission must also return the legacy row, with releasedAt /
      // releasedBy coerced to null since the legacy doc has no release fields.
      const active = await testSubmissionService.getActiveSubmission(
        "test-legacy",
        "student-legacy",
      );
      expect(active).not.toBeNull();
      expect(active?.testId).toBe("test-legacy");
      expect(active?.studentId).toBe("student-legacy");
      expect(active?.releasedAt).toBeNull();
      expect(active?.releasedBy).toBeNull();
    },
  );
});

describe("TestSubmissionService.getActiveSubmission", () => {
  dbIt(
    "returns the active row with releasedAt/releasedBy coerced to null when fresh",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      await testSubmissionService.submitTest("test-active", "student-1");

      const active = await testSubmissionService.getActiveSubmission(
        "test-active",
        "student-1",
      );

      expect(active).not.toBeNull();
      expect(active?.testId).toBe("test-active");
      expect(active?.studentId).toBe("student-1");
      expect(active?.submittedAt).toBeInstanceOf(Date);
      expect(active?.releasedAt).toBeNull();
      expect(active?.releasedBy).toBeNull();
    },
  );

  dbIt(
    "returns null when no submission exists for the (testId, studentId)",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      expect(
        await testSubmissionService.getActiveSubmission("nope", "nobody"),
      ).toBeNull();
    },
  );

  dbIt(
    "returns null when the only row for (testId, studentId) is soft-deleted",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      await testSubmissionService.submitTest("test-soft-only", "student-1");
      await testSubmissionService.deleteSubmission(
        "test-soft-only",
        "student-1",
      );

      expect(
        await testSubmissionService.getActiveSubmission(
          "test-soft-only",
          "student-1",
        ),
      ).toBeNull();
    },
  );
});

describe("TestSubmissionService.releaseGradeToStudent", () => {
  dbIt(
    "stamps releasedAt and releasedBy on the active submission",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      await testSubmissionService.submitTest("test-rel", "student-1");

      await testSubmissionService.releaseGradeToStudent(
        "test-rel",
        "student-1",
        "admin-1",
      );

      const active = await testSubmissionService.getActiveSubmission(
        "test-rel",
        "student-1",
      );
      expect(active?.releasedAt).toBeInstanceOf(Date);
      expect(active?.releasedBy).toBe("admin-1");
    },
  );

  dbIt(
    "re-release refreshes both fields when a different admin re-releases",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      await testSubmissionService.submitTest("test-rel-2", "student-1");

      await testSubmissionService.releaseGradeToStudent(
        "test-rel-2",
        "student-1",
        "admin-first",
      );
      const first = await testSubmissionService.getActiveSubmission(
        "test-rel-2",
        "student-1",
      );

      await testSubmissionService.releaseGradeToStudent(
        "test-rel-2",
        "student-1",
        "admin-second",
      );
      const second = await testSubmissionService.getActiveSubmission(
        "test-rel-2",
        "student-1",
      );

      // Use `>=` (same-millisecond risk) AND assert the `releasedBy` switched
      // — the latter is the stronger signal that the row was actually updated.
      expect((second!.releasedAt as Date).getTime()).toBeGreaterThanOrEqual(
        (first!.releasedAt as Date).getTime(),
      );
      expect(second?.releasedBy).toBe("admin-second");
    },
  );

  dbIt("throws when no active submission exists", async ({ db }) => {
    const { testSubmissionService } = buildCoreServices(db);

    await expect(
      testSubmissionService.releaseGradeToStudent(
        "test-nobody",
        "ghost",
        "admin-1",
      ),
    ).rejects.toThrow("No active submission to release");
  });

  dbIt(
    "does not touch a soft-deleted row's stale releasedAt",
    async ({ db }) => {
      const { testSubmissionService } = buildCoreServices(db);

      // Seed a soft-deleted row with a stale releasedAt directly.
      const staleReleasedAt = new Date("2020-01-01T00:00:00Z");
      await db.collection("test_submission").insertOne({
        id: "old",
        testId: "test-soft-stale",
        studentId: "student-1",
        submittedAt: new Date("2019-12-31T00:00:00Z"),
        deletedAt: new Date("2020-02-01T00:00:00Z"),
        releasedAt: staleReleasedAt,
        releasedBy: "admin-old",
      });

      // Create a new active submission for the same student/test.
      await testSubmissionService.submitTest("test-soft-stale", "student-1");

      // Release on the active row only.
      await testSubmissionService.releaseGradeToStudent(
        "test-soft-stale",
        "student-1",
        "admin-new",
      );

      // The soft-deleted row's audit fields must be byte-equal to the stale
      // seed — the mutator filter is `deletedAt: null`, so the soft-deleted
      // row should be invisible to it.
      const softDeleted = await db
        .collection("test_submission")
        .findOne({ id: "old" });
      expect((softDeleted?.releasedAt as Date).getTime()).toBe(
        staleReleasedAt.getTime(),
      );
      expect(softDeleted?.releasedBy).toBe("admin-old");

      // The active row got the new release fields.
      const active = await testSubmissionService.getActiveSubmission(
        "test-soft-stale",
        "student-1",
      );
      expect(active?.releasedBy).toBe("admin-new");
    },
  );
});

describe("TestSubmissionService - Edge Cases", () => {
  dbIt("submitTest called twice rejects the second call", async ({ db }) => {
    const { questionService, answerService, testSubmissionService } =
      buildCoreServices(db);

    const question = await questionService.addQuestion("test-idem", {
      title: "Q?",
      content: "Choose.",
      createdBy: "admin-1",
      type: "single_select",
      options: [
        { text: "A", isCorrect: true },
        { text: "B", isCorrect: false },
      ],
    });

    const optA = question.options.find((o) => o.text === "A")!.id;

    await answerService.submitAnswer({
      testId: "test-idem",
      questionId: question.id,
      studentId: "student-1",
      answer: { type: "mc", selectedIds: [optA] },
    });

    await testSubmissionService.submitTest("test-idem", "student-1");

    await expect(
      testSubmissionService.submitTest("test-idem", "student-1"),
    ).rejects.toThrow("already been submitted");
  });

  dbIt(
    "submitTest on a free-text-only test creates no grades and does not crash",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);

      const q = await questionService.addQuestion("test-freeonly", {
        title: "Open Q",
        content: "Explain.",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-freeonly",
        questionId: q.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "my answer" },
      });

      await testSubmissionService.submitTest("test-freeonly", "student-1");

      const grades = await gradeService.getGrades("test-freeonly", "student-1");
      expect(grades).toHaveLength(0);
    },
  );

  dbIt(
    "submitTest when student has no MC answer skips that question and creates no grade",
    async ({ db }) => {
      const { questionService, gradeService, testSubmissionService } =
        buildCoreServices(db);

      const q = (await questionService.addQuestion("test-noanswer", {
        title: "Q?",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;

      // Student never answered — just submits the test
      await testSubmissionService.submitTest("test-noanswer", "student-1");

      const grade = await gradeService.getGrade(
        "test-noanswer",
        q.id,
        "student-1",
      );
      expect(grade).toBeNull();
    },
  );

  dbIt(
    "submitTest with 2 MC questions where only one is answered auto-grades the answered question and leaves the other with no grade",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = buildCoreServices(db);

      const q1 = await questionService.addQuestion("test-partial", {
        title: "Q1",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      });

      const q2 = await questionService.addQuestion("test-partial", {
        title: "Q2",
        content: "Choose.",
        createdBy: "admin-1",
        type: "single_select",
        options: [
          { text: "X", isCorrect: true },
          { text: "Y", isCorrect: false },
        ],
      });

      // Student answers Q1 correctly, skips Q2
      const correctOpt = q1.options.find((o) => o.isCorrect)!.id;
      await answerService.submitAnswer({
        testId: "test-partial",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [correctOpt] },
      });

      await testSubmissionService.submitTest("test-partial", "student-1");

      // Q1 answered correctly → auto-graded 100
      const grade1 = await gradeService.getGrade(
        "test-partial",
        q1.id,
        "student-1",
      );
      expect(grade1?.score).toBe(100);

      // Q2 unanswered → no individual grade
      const grade2 = await gradeService.getGrade(
        "test-partial",
        q2.id,
        "student-1",
      );
      expect(grade2).toBeNull();

      // Overall test score: Q1=100, Q2=0 (unanswered) → average = 50
      const avg = await gradeService.getAverageScore(
        "test-partial",
        "student-1",
      );
      expect(avg).toBe(50);
    },
  );
});
