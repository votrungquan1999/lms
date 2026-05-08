import type { Db } from "mongodb";
import { AnswerService } from "src/lib/answer-service";
import { GradeService } from "src/lib/grade-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestStatusService } from "src/lib/test-status-service";
import { TestSubmissionService } from "src/lib/test-submission-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

function makeServices(db: Db) {
  const questionService = new QuestionService(db);
  const answerService = new AnswerService(db, questionService);
  const testService = new TestService(db);
  const gradeService = new GradeService(
    db,
    questionService,
    answerService,
    testService,
  );
  const testSubmissionService = new TestSubmissionService(db, gradeService);
  const testStatusService = new TestStatusService(
    answerService,
    testSubmissionService,
    gradeService,
  );
  return { answerService, gradeService, testStatusService };
}

describe("TestStatusService", () => {
  dbIt(
    "should return 'not_started' when student has no answers",
    async ({ db }) => {
      const { testStatusService } = makeServices(db);

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        3,
      );
      expect(status).toBe("not_started");
    },
  );

  dbIt(
    "should return 'in_progress' when student answered some questions",
    async ({ db }) => {
      const { answerService, testStatusService } = makeServices(db);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "My answer" },
      });

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        3,
      );
      expect(status).toBe("in_progress");
    },
  );

  dbIt(
    "should return 'submitted' when student answered all questions",
    async ({ db }) => {
      const { answerService, testStatusService } = makeServices(db);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "Answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: { type: "free_text", text: "Answer 2" },
      });

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );
      expect(status).toBe("submitted");
    },
  );

  dbIt(
    "getStatusCounts should return per-status histogram across multiple students with all four keys present",
    async ({ db }) => {
      const { answerService, gradeService, testStatusService } =
        makeServices(db);
      const testId = "test-1";
      const totalQuestions = 2;

      // student-not-started: no answers at all
      // student-in-progress: 1 of 2 answered
      await answerService.submitAnswer({
        testId,
        questionId: "q-1",
        studentId: "student-in-progress",
        answer: { type: "free_text", text: "Partial" },
      });
      // student-submitted: both answered, none graded
      await answerService.submitAnswer({
        testId,
        questionId: "q-1",
        studentId: "student-submitted",
        answer: { type: "free_text", text: "A" },
      });
      await answerService.submitAnswer({
        testId,
        questionId: "q-2",
        studentId: "student-submitted",
        answer: { type: "free_text", text: "B" },
      });
      // student-graded: both answered, both graded
      await answerService.submitAnswer({
        testId,
        questionId: "q-1",
        studentId: "student-graded",
        answer: { type: "free_text", text: "A" },
      });
      await answerService.submitAnswer({
        testId,
        questionId: "q-2",
        studentId: "student-graded",
        answer: { type: "free_text", text: "B" },
      });
      await gradeService.gradeQuestion({
        testId,
        questionId: "q-1",
        studentId: "student-graded",
        score: 100,
        feedback: "",
        gradedBy: "admin-1",
      });
      await gradeService.gradeQuestion({
        testId,
        questionId: "q-2",
        studentId: "student-graded",
        score: 90,
        feedback: "",
        gradedBy: "admin-1",
      });

      const counts = await testStatusService.getStatusCounts(
        testId,
        [
          "student-not-started",
          "student-in-progress",
          "student-submitted",
          "student-graded",
        ],
        totalQuestions,
      );

      expect(counts).toEqual({
        not_started: 1,
        in_progress: 1,
        submitted: 1,
        graded: 1,
      });
    },
  );

  dbIt(
    "should return 'submitted' when partially graded (Atomic Reveal)",
    async ({ db }) => {
      // This covers: Mixed test - MC auto-graded but student sees nothing until free-text graded -> full reveal
      const { answerService, gradeService, testStatusService } =
        makeServices(db);

      // Answer both questions (free-text only; status tests don't require real MC questions)
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "My MC-like answer" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: { type: "free_text", text: "Free text answer" },
      });

      // Simulate auto-grading of the first question
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 100,
        feedback: "",
        gradedBy: "system",
      });

      // Check status after one question graded but free-text is pending
      // Should be 'submitted' to ensure Atomic Reveal (partial grades not surfaced)
      const statusPartiallyGraded = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );
      expect(statusPartiallyGraded).toBe("submitted");

      // Teacher grades second question
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        score: 80,
        feedback: "Good",
        gradedBy: "admin-1",
      });

      // Now all graded → status flips to 'graded' to trigger reveal
      const statusFullyGraded = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );
      expect(statusFullyGraded).toBe("graded");
    },
  );
});
