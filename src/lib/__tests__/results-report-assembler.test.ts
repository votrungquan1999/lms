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
