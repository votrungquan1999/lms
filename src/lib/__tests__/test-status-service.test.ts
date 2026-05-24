import type { Db } from "mongodb";
import { TestStatusService } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

function makeServices(db: Db) {
  const { answerService, gradeService, testSubmissionService } =
    buildCoreServices(db);
  const testStatusService = new TestStatusService(
    answerService,
    testSubmissionService,
    gradeService,
  );
  return {
    answerService,
    gradeService,
    testStatusService,
    testSubmissionService,
  };
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
      const {
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);
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
      // student-graded: both answered, both graded, test submitted
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
      await testSubmissionService.submitTest(testId, "student-graded");
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
      const {
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

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

      // Student submits the test (the Graded transition requires explicit submission).
      await testSubmissionService.submitTest("test-1", "student-1");

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

  dbIt(
    "should return 'graded' for a submitted test where every answered question has a grade, even when some questions were left blank",
    async ({ db }) => {
      // Given: a 2-question test where the student answered only q-1
      // (q-2 was left blank — no Answer row, no Grade row) and the
      // teacher graded q-1. The test was explicitly submitted.
      const {
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "My only answer" },
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 80,
        feedback: "ok",
        gradedBy: "admin-1",
      });
      await testSubmissionService.submitTest("test-1", "student-1");

      // When: status is derived against totalQuestions=2 (one of which
      // was never answered).
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );

      // Then: status is 'graded' because every answered question has a
      // grade, and the test was explicitly submitted. Blank questions
      // do not block the transition.
      expect(status).toBe("graded");
    },
  );

  dbIt(
    "should return 'submitted' when the test was submitted but at least one answered question has no grade row yet",
    async ({ db }) => {
      // Given: a 3-question test where the student answered q-1 and q-2
      // (q-3 was left blank). The teacher has graded only q-1. The test
      // was explicitly submitted. This setup uniquely targets the new
      // answered-set vs graded-set comparison — answers.length (2) is
      // strictly less than totalQuestions (3), so without the submit
      // gate the old code would have returned InProgress.
      const {
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await testSubmissionService.submitTest("test-1", "student-1");
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 60,
        feedback: "ok",
        gradedBy: "admin-1",
      });

      // When: status is derived with totalQuestions=3.
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        3,
      );

      // Then: status is 'submitted' — q-2 has an answer but no grade row,
      // so the Graded transition is correctly blocked.
      expect(status).toBe("submitted");
    },
  );

  dbIt(
    "should NOT return 'graded' when every answered question is graded but the test has not been explicitly submitted",
    async ({ db }) => {
      // Given: a 2-question test where the student answered both
      // questions and the auto-grader recorded grade rows for both, but
      // the student has not called submitTest. With the pre-fix code,
      // grades.length >= totalQuestions short-circuited to Graded even
      // without an explicit submission — a latent bug.
      const { answerService, gradeService, testStatusService } =
        makeServices(db);

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 100,
        feedback: "",
        gradedBy: "system",
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        score: 100,
        feedback: "",
        gradedBy: "system",
      });

      // When: status is derived with no submitTest call.
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );

      // Then: the submit gate keeps the status at 'submitted' (because
      // the student answered every question, the fallback for
      // answers.length >= totalQuestions applies), NOT 'graded'. The
      // strict assertion below catches both the original regression
      // (Graded without submit) and over-corrections like returning
      // InProgress when the fallback should apply.
      expect(status).toBe("submitted");
    },
  );
});
