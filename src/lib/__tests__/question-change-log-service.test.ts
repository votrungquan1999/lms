/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import { AnswerService } from "src/lib/answer-service";
import { QuestionChangeLogService } from "src/lib/question-change-log-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestStartService } from "src/lib/test-start-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("QuestionChangeLogService", () => {
  dbIt(
    "records a change with the given before/after values, changed fields and answered count",
    async ({ db }) => {
      const changeLogService = new QuestionChangeLogService(db);

      await changeLogService.recordChange({
        questionId: "q-1",
        testId: "test-1",
        poolId: null,
        changedBy: "admin-1",
        action: "update",
        changedFields: ["referenceAnswer"],
        before: { referenceAnswer: null },
        after: { referenceAnswer: "Objects with mass attract each other." },
        answeredStudentCount: 3,
      });

      const row = await db
        .collection("questionChangeLog")
        .findOne({ questionId: "q-1" });

      expect(row).toMatchObject({
        questionId: "q-1",
        testId: "test-1",
        poolId: null,
        changedBy: "admin-1",
        action: "update",
        changedFields: ["referenceAnswer"],
        before: { referenceAnswer: null },
        after: { referenceAnswer: "Objects with mass attract each other." },
        answeredStudentCount: 3,
      });
    },
  );

  // ── The load-bearing requirement (D48) ──────────────────────────────────
  dbIt(
    "reconstructs a stranded answer's option text purely from the log row's before.options",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(
        db,
        questionService,
        new TestService(db),
        new TestStartService(db),
      );
      const changeLogService = new QuestionChangeLogService(db);

      const question = await questionService.addQuestion("test-1", {
        title: "Capital of France?",
        content: "Choose one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
      });
      const parisOption = question.options[0];

      // A student answers before the edit — their selection references the
      // pre-edit option id.
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [parisOption.id] },
      });

      // Simulate an options rewrite that mints fresh ids (Step 27's own
      // hazard) — a direct collection write, since options-editing isn't
      // wired into `updateQuestion` until Step 27. Only the change log's row
      // shape is under test here.
      const rewrittenOptions = [
        { id: crypto.randomUUID(), text: "Paris (updated)", isCorrect: true },
        { id: crypto.randomUUID(), text: "London (updated)", isCorrect: false },
      ];
      await changeLogService.recordChange({
        questionId: question.id,
        testId: "test-1",
        poolId: null,
        changedBy: "admin-1",
        action: "update",
        changedFields: ["options"],
        before: { options: question.options },
        after: { options: rewrittenOptions },
        answeredStudentCount: 1,
      });
      await db
        .collection("question")
        .updateOne(
          { id: question.id },
          { $set: { options: rewrittenOptions } },
        );

      // The student's stored answer now dangles: its id matches nothing on
      // the current question.
      const [studentAnswer] = await answerService.getLatestAnswers(
        "test-1",
        "student-1",
      );
      const currentIds = new Set(rewrittenOptions.map((o) => o.id));
      if (studentAnswer.answer.type !== "mc") {
        throw new Error("expected an mc answer");
      }
      const [selectedId] = studentAnswer.answer.selectedIds;
      expect(currentIds.has(selectedId)).toBe(false);

      // Reconstruct what they actually selected using ONLY the change log's
      // before-image — nothing else on the current question can do this.
      const logRow = await db
        .collection("questionChangeLog")
        .findOne({ questionId: question.id });
      expect(logRow).not.toBeNull();
      const beforeOptions = (logRow?.before.options ?? []) as {
        id: string;
        text: string;
      }[];
      const reconstructedText = beforeOptions.find(
        (o) => o.id === selectedId,
      )?.text;

      expect(reconstructedText).toBe("Paris");
    },
  );
});
