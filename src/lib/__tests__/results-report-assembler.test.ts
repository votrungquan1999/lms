import { QuestionGradeStatus } from "src/lib/results-report-assembler";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";
import { createAlice, makeAssembler } from "./results-report-assembler.helpers";

const dbIt = withTestDb(it);

describe("ResultsReportAssembler.buildReport — per-test summary", () => {
  dbIt(
    "reports the selected student's per-test score, status, and overall feedback across only the selected tests, in selected order",
    async ({ db }) => {
      // Given an enrolled student "Alice" and three tests A, B, C, where A and
      // B have a graded, submitted answer and overall feedback recorded.
      const courseId = "course-1";
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
        testFeedbackService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);

      const testA = await testService.createTest(courseId, {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const testB = await testService.createTest(courseId, {
        title: "Test B",
        description: "",
        createdBy: "admin-1",
      });
      const testC = await testService.createTest(courseId, {
        title: "Test C",
        description: "",
        createdBy: "admin-1",
      });

      async function seedGraded(
        testId: string,
        score: number,
        feedback: string,
      ) {
        const q = await questionService.addQuestion(testId, {
          title: "Q1",
          content: "?",
          createdBy: "admin-1",
        });
        await answerService.submitAnswer({
          testId,
          questionId: q.id,
          studentId: alice.id,
          answer: { type: "free_text", text: "answer" },
        });
        await testSubmissionService.submitTest(testId, alice.id);
        await gradeService.gradeQuestion({
          testId,
          questionId: q.id,
          studentId: alice.id,
          score,
          feedback: "",
          gradedBy: "admin-1",
        });
        await testFeedbackService.setTestFeedback({
          testId,
          studentId: alice.id,
          feedback,
          gradedBy: "admin-1",
        });
      }

      await seedGraded(testA.id, 80, "Great work on A");
      await seedGraded(testB.id, 90, "Solid B");

      // When the assembler builds the report for Alice over [A, B] only.
      const report = await assembler.buildReport(alice.id, [
        testA.id,
        testB.id,
      ]);

      // Then it identifies the student as "Alice".
      expect(report.student.name).toBe("Alice");

      // And it contains exactly 2 tests, in the selected order A then B.
      expect(report.tests).toHaveLength(2);
      expect(report.tests.map((t) => t.testId)).toEqual([testA.id, testB.id]);

      // And test A shows its score, derived status, and overall feedback.
      const entryA = report.tests[0];
      expect(entryA.title).toBe("Test A");
      expect(entryA.score).toBe(80);
      expect(entryA.status).toBe("graded");
      expect(entryA.overallFeedback).toBe("Great work on A");

      // And test B shows its own distinct score, status, and feedback (guards
      // against second-entry mis-mapping).
      const entryB = report.tests[1];
      expect(entryB.title).toBe("Test B");
      expect(entryB.score).toBe(90);
      expect(entryB.status).toBe("graded");
      expect(entryB.overallFeedback).toBe("Solid B");

      // But test C does not appear in the report.
      expect(report.tests.map((t) => t.testId)).not.toContain(testC.id);
    },
  );

  dbIt(
    "shows a submitted blank as Graded with score 0 while an answered, ungraded question beside it stays Pending",
    async ({ db }) => {
      // Given a 3-question test where the student answered and got graded
      // on Q1, left Q2 entirely blank, answered Q3 (not graded yet), then
      // submitted.
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const q1 = await questionService.addQuestion(test.id, {
        title: "Answered",
        content: "?",
        createdBy: "admin-1",
      });
      const q2 = await questionService.addQuestion(test.id, {
        title: "Blank",
        content: "?",
        createdBy: "admin-1",
      });
      const q3 = await questionService.addQuestion(test.id, {
        title: "Awaiting grading",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "my answer" },
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q3.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "needs a teacher" },
      });
      // Q2 deliberately left blank.
      await testSubmissionService.submitTest(test.id, alice.id);
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: alice.id,
        score: 80,
        feedback: "",
        gradedBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the blank question shows Graded with score 0 in the PDF's
      // underlying data — not "Pending", which would misreport it as still
      // needing a teacher's attention.
      const breakdown = report.tests[0].questions;
      const blankEntry = breakdown.find((q) => q.questionId === q2.id);
      expect(blankEntry?.gradeStatus).toBe(QuestionGradeStatus.Graded);
      expect(blankEntry?.score).toBe(0);
      // And it is flagged as having no answer, so the PDF can tell this
      // counted 0 apart from a genuinely graded 0.
      expect(blankEntry?.hasAnswer).toBe(false);

      // And the answered question the teacher has not scored yet still
      // reads Pending, never a false 0.
      const awaitingEntry = breakdown.find((q) => q.questionId === q3.id);
      expect(awaitingEntry?.gradeStatus).toBe(QuestionGradeStatus.Pending);
      expect(awaitingEntry?.score).toBeNull();
      expect(awaitingEntry?.hasAnswer).toBe(true);
    },
  );

  dbIt(
    "flags an answered photo question as answered even though it has no text to show",
    async ({ db }) => {
      // Given a submitted test whose only question takes a photo, answered
      // and scored a genuine 0 — its display text is always empty.
      const {
        assembler,
        studentService,
        testService,
        questionService,
        answerService,
        gradeService,
        testSubmissionService,
      } = makeAssembler(db);

      const alice = await createAlice(studentService);
      const test = await testService.createTest("course-1", {
        title: "Test A",
        description: "",
        createdBy: "admin-1",
      });
      const photoQuestion = await questionService.addQuestion(test.id, {
        title: "Show your work",
        content: "?",
        createdBy: "admin-1",
        type: "image_answer",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: photoQuestion.id,
        studentId: alice.id,
        answer: { type: "image", mediaKeys: ["answers/alice/work.png"] },
      });
      await testSubmissionService.submitTest(test.id, alice.id);
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: photoQuestion.id,
        studentId: alice.id,
        score: 0,
        feedback: "",
        gradedBy: "admin-1",
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then it has no display text yet still counts as answered, so the
      // PDF never labels its real 0 "(no answer)".
      const [entry] = report.tests[0].questions;
      expect(entry.answer).toEqual([]);
      expect(entry.hasAnswer).toBe(true);
      expect(entry.score).toBe(0);
    },
  );

  dbIt(
    "keeps an unanswered question Pending, not 0, while the student has not submitted",
    async ({ db }) => {
      // Given a 2-question test the student is still working on: Q1
      // answered, Q2 not reached yet, no submission.
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
      const q1 = await questionService.addQuestion(test.id, {
        title: "Answered",
        content: "?",
        createdBy: "admin-1",
      });
      const q2 = await questionService.addQuestion(test.id, {
        title: "Not reached yet",
        content: "?",
        createdBy: "admin-1",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: alice.id,
        answer: { type: "free_text", text: "my answer" },
      });

      // When the assembler builds the report.
      const report = await assembler.buildReport(alice.id, [test.id]);

      // Then the open question is not scored as a blank 0 — the student
      // may still answer it.
      const openEntry = report.tests[0].questions.find(
        (q) => q.questionId === q2.id,
      );
      expect(openEntry?.gradeStatus).toBe(QuestionGradeStatus.Pending);
      expect(openEntry?.score).toBeNull();
    },
  );

  dbIt(
    "throws when the student does not exist rather than building an empty report",
    async ({ db }) => {
      // Given no student with the requested id.
      const { assembler } = makeAssembler(db);

      // When the report is built for that unknown id, then it rejects.
      await expect(
        assembler.buildReport("missing-student", ["any-test"]),
      ).rejects.toThrow(/student/i);
    },
  );
});
