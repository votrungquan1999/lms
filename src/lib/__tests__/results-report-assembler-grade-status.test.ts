import { QuestionGradeStatus } from "src/lib/results-report-assembler";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";
import { createAlice, makeAssembler } from "./results-report-assembler.helpers";

const dbIt = withTestDb(it);

describe("ResultsReportAssembler.buildReport — pending vs graded", () => {
  dbIt(
    "marks an answered-but-ungraded free-text question as Pending with a null score, not 0",
    async ({ db }) => {
      // Given a free-text question the student answered but which has no grade.
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q = await questionService.addQuestion(test.id, {
        title: "Explain X",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "My answer" },
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then that question's grade status is Pending and its score is null
      // (NOT coerced to 0).
      const breakdown = report.tests[0].questions;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].gradeStatus).toBe(QuestionGradeStatus.Pending);
      expect(breakdown[0].score).toBeNull();
      expect(breakdown[0].score).not.toBe(0);
    },
  );

  dbIt(
    "marks the whole test as Pending with a null score when the weighted average is null",
    async ({ db }) => {
      // Given a selected test with an answered free-text question that has no
      // grade row — so the weighted average is null (manual review pending).
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q = await questionService.addQuestion(test.id, {
        title: "Explain X",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "My answer" },
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the test's grade status is Pending and its score is null, not 0.
      expect(report.tests).toHaveLength(1);
      const entry = report.tests[0];
      expect(entry.gradeStatus).toBe(QuestionGradeStatus.Pending);
      expect(entry.score).toBeNull();
      expect(entry.score).not.toBe(0);
    },
  );

  dbIt(
    "keeps a genuinely zero-scored question as Graded with score 0, not Pending",
    async ({ db }) => {
      // Given a free-text question the student answered and the teacher graded
      // explicitly with a score of 0.
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q = await questionService.addQuestion(test.id, {
        title: "Explain X",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "Wrong answer" },
      });
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q.id,
        studentId: alice.id,
        score: 0,
        feedback: "Incorrect",
        gradedBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the question is Graded with score 0 — distinct from Pending.
      const breakdown = report.tests[0].questions;
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].gradeStatus).toBe(QuestionGradeStatus.Graded);
      expect(breakdown[0].score).toBe(0);
      expect(breakdown[0].gradeStatus).not.toBe(QuestionGradeStatus.Pending);
    },
  );
});
