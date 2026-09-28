import type { Db } from "mongodb";
import { TestStatusService } from "src/lib/test-status-service";
import { buildCoreServices } from "src/tests/build-core-services";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

function makeServices(db: Db) {
  const {
    answerService,
    gradeService,
    testSubmissionService,
    testStartService,
    testService,
    questionService,
  } = buildCoreServices(db);
  const testStatusService = new TestStatusService(
    answerService,
    testSubmissionService,
    gradeService,
    testStartService,
    testService,
    questionService,
  );
  return {
    answerService,
    gradeService,
    testStatusService,
    testSubmissionService,
    testStartService,
    testService,
    questionService,
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
    "should return 'in_progress' when a timed test was started but nothing has been answered yet",
    async ({ db }) => {
      const { testStartService, testStatusService } = makeServices(db);

      await testStartService.recordStart("test-1", "student-1", new Date());

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        3,
      );
      expect(status).toBe("in_progress");
    },
  );

  dbIt(
    "should return 'graded' when a student explicitly submits a test having answered nothing at all",
    async ({ db }) => {
      const { testSubmissionService, testStatusService } = makeServices(db);

      await testSubmissionService.submitTest("test-1", "student-1");

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        3,
      );
      expect(status).toBe("graded");
    },
  );

  dbIt(
    "should return 'submitted', not 'graded', when a practice test is explicitly submitted having answered nothing at all",
    async ({ db }) => {
      // Given: a practice test — exempt from the all-blank-is-Graded rule,
      // so a blank practice submission reads Submitted, exactly like an
      // answered practice submission.
      const { testService, testSubmissionService, testStatusService } =
        makeServices(db);
      const practiceTest = await testService.createTest("course-1", {
        title: "Practice Quiz",
        description: "",
        createdBy: "admin-1",
        isPractice: true,
      });

      await testSubmissionService.submitTest(practiceTest.id, "student-1");

      const status = await testStatusService.getStatus(
        practiceTest.id,
        "student-1",
        3,
      );
      expect(status).toBe("submitted");
    },
  );

  dbIt(
    "should return 'in_progress' when student answered some questions",
    async ({ db }) => {
      // Real question — status now checks live-question existence, so a
      // bare "q-1" string with no backing question would be filtered out.
      const { questionService, answerService, testStatusService } =
        makeServices(db);
      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
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
    "should return 'in_progress' when student answered every question but did not press Submit",
    async ({ db }) => {
      const { questionService, answerService, testStatusService } =
        makeServices(db);
      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Answer 2" },
      });

      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );
      expect(status).toBe("in_progress");
    },
  );

  dbIt(
    "getStatusCounts should return per-status histogram across multiple students with all four keys present",
    async ({ db }) => {
      const {
        questionService,
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);
      const testId = "test-1";
      const totalQuestions = 2;

      const q1 = await questionService.addQuestion(testId, {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion(testId, {
        title: "Q2",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      // student-not-started: no answers at all
      // student-in-progress: 1 of 2 answered
      await answerService.submitAnswer({
        testId,
        questionId: q1.id,
        studentId: "student-in-progress",
        answer: { type: "free_text", text: "Partial" },
      });
      // student-answered-all: both answered, Submit never pressed — in_progress
      await answerService.submitAnswer({
        testId,
        questionId: q1.id,
        studentId: "student-answered-all",
        answer: { type: "free_text", text: "A" },
      });
      await answerService.submitAnswer({
        testId,
        questionId: q2.id,
        studentId: "student-answered-all",
        answer: { type: "free_text", text: "B" },
      });
      // student-graded: both answered, both graded, test submitted
      await answerService.submitAnswer({
        testId,
        questionId: q1.id,
        studentId: "student-graded",
        answer: { type: "free_text", text: "A" },
      });
      await answerService.submitAnswer({
        testId,
        questionId: q2.id,
        studentId: "student-graded",
        answer: { type: "free_text", text: "B" },
      });
      await testSubmissionService.submitTest(testId, "student-graded");
      await gradeService.gradeQuestion({
        testId,
        questionId: q1.id,
        studentId: "student-graded",
        score: 100,
        feedback: "",
        gradedBy: "admin-1",
      });
      await gradeService.gradeQuestion({
        testId,
        questionId: q2.id,
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
          "student-answered-all",
          "student-graded",
        ],
        totalQuestions,
      );

      expect(counts).toEqual({
        not_started: 1,
        in_progress: 2,
        submitted: 0,
        graded: 1,
      });
    },
  );

  dbIt(
    "should return 'submitted' when partially graded (Atomic Reveal)",
    async ({ db }) => {
      // This covers: Mixed test - MC auto-graded but student sees nothing until free-text graded -> full reveal
      const {
        questionService,
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      // Real questions — status now checks live-question existence, so a
      // bare "q-1"/"q-2" string with no backing question would be treated
      // as answering a deleted question and filtered out.
      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      // Answer both questions (free-text only; status tests don't require real MC questions)
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "My MC-like answer" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Free text answer" },
      });

      // Student submits the test (the Graded transition requires explicit submission).
      await testSubmissionService.submitTest("test-1", "student-1");

      // Simulate auto-grading of the first question
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q1.id,
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
        questionId: q2.id,
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
        questionService,
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      await questionService.addQuestion("test-1", {
        title: "Q2 (left blank)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "My only answer" },
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q1.id,
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
        questionService,
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });
      await questionService.addQuestion("test-1", {
        title: "Q3 (left blank)",
        content: "Q3",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await testSubmissionService.submitTest("test-1", "student-1");
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q1.id,
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
    "should return 'graded', not permanently 'submitted', when the student's only ungraded answer belongs to a question that has since been deleted",
    async ({ db }) => {
      // Given: a 2-question test. The student answered both and the
      // teacher graded Q1. Before Q2 is ever graded, the teacher deletes
      // it — its answer is now dangling with no way to grade it.
      const {
        questionService,
        answerService,
        gradeService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);

      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2 (will be deleted)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await testSubmissionService.submitTest("test-1", "student-1");
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        score: 80,
        feedback: "ok",
        gradedBy: "admin-1",
      });

      // When: the teacher deletes Q2 before ever grading its answer.
      await questionService.deleteQuestion(q2.id, "admin-1");

      // Then: status reads 'graded' — the dangling deleted-question answer
      // no longer blocks the transition. totalQuestions=1 matches what a
      // real caller derives from the live (post-delete) question list.
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        1,
      );
      expect(status).toBe("graded");
    },
  );

  dbIt(
    "should return 'submitted', not 'graded', when a practice test is submitted and its only answer belongs to a question that has since been deleted",
    async ({ db }) => {
      // Given: a 2-question practice test. The student answered only Q2,
      // submitted, and the teacher then deleted Q2 — with that answer
      // ignored, this is a blank practice submission.
      const {
        questionService,
        answerService,
        testService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);
      const practiceTest = await testService.createTest("course-1", {
        title: "Practice Quiz",
        description: "",
        createdBy: "admin-1",
        isPractice: true,
      });
      await questionService.addQuestion(practiceTest.id, {
        title: "Q1 (left blank)",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion(practiceTest.id, {
        title: "Q2 (will be deleted)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: practiceTest.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await testSubmissionService.submitTest(practiceTest.id, "student-1");

      // When: the teacher deletes Q2.
      await questionService.deleteQuestion(q2.id, "admin-1");

      // Then: practice tests never grade, so it reads Submitted like any
      // other blank practice submission — never Graded.
      const status = await testStatusService.getStatus(
        practiceTest.id,
        "student-1",
        1,
      );
      expect(status).toBe("submitted");
    },
  );

  dbIt(
    "should return 'graded' when a test is submitted and its only answer belongs to a question that has since been deleted",
    async ({ db }) => {
      // Given: a 2-question test. The student answered only Q2 and
      // submitted; the teacher then deleted Q2 before grading it.
      const {
        questionService,
        answerService,
        testStatusService,
        testSubmissionService,
      } = makeServices(db);
      await questionService.addQuestion("test-1", {
        title: "Q1 (left blank)",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2 (will be deleted)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await testSubmissionService.submitTest("test-1", "student-1");

      // When: the teacher deletes Q2.
      await questionService.deleteQuestion(q2.id, "admin-1");

      // Then: with that answer ignored the submission is entirely blank,
      // so it reads Graded — never stuck at Submitted.
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        1,
      );
      expect(status).toBe("graded");
    },
  );

  dbIt(
    "should return 'in_progress' when every answered question is graded but the test has not been explicitly submitted",
    async ({ db }) => {
      // Given: a 2-question test where the student answered both
      // questions and the auto-grader recorded grade rows for both, but
      // the student has not called submitTest. Only pressing Submit
      // moves the status past in_progress, regardless of grading.
      const {
        questionService,
        answerService,
        gradeService,
        testStatusService,
      } = makeServices(db);
      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 1" },
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: q2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer 2" },
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q1.id,
        studentId: "student-1",
        score: 100,
        feedback: "",
        gradedBy: "system",
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: q2.id,
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

      // Then: no explicit submission means in_progress, even though every
      // answered question already has a grade.
      expect(status).toBe("in_progress");
    },
  );

  dbIt(
    "should return 'not_started' for an unsubmitted student whose only answer was to a since-deleted question, but 'in_progress' when a timed test in the same state has an active start",
    async ({ db }) => {
      // Given: an untimed test where Q1 stays live and unanswered, and the
      // student's only answer (Q2) is later deleted — no live answer and no
      // start record remain.
      const {
        questionService,
        answerService,
        testStartService,
        testStatusService,
      } = makeServices(db);

      await questionService.addQuestion("test-untimed", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const untimedQ2 = await questionService.addQuestion("test-untimed", {
        title: "Q2 (will be deleted)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: "test-untimed",
        questionId: untimedQ2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer" },
      });
      await questionService.deleteQuestion(untimedQ2.id, "admin-1");

      // When: status is derived against totalQuestions=1 (the live count
      // after Q2's deletion).
      const untimedStatus = await testStatusService.getStatus(
        "test-untimed",
        "student-1",
        1,
      );

      // Then: with no live answer and no start record, it reads Not
      // Started — agreeing with a "0 / N answered" progress bar.
      expect(untimedStatus).toBe("not_started");

      // Given: the identical deleted-only-answer state, but this time on a
      // timed test the student actually started.
      await questionService.addQuestion("test-timed", {
        title: "Q1",
        content: "Q1",
        createdBy: "admin-1",
        type: "free_text",
      });
      const timedQ2 = await questionService.addQuestion("test-timed", {
        title: "Q2 (will be deleted)",
        content: "Q2",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: "test-timed",
        questionId: timedQ2.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "answer" },
      });
      await questionService.deleteQuestion(timedQ2.id, "admin-1");
      await testStartService.recordStart("test-timed", "student-1", new Date());

      // When: status is derived for the timed test.
      const timedStatus = await testStatusService.getStatus(
        "test-timed",
        "student-1",
        1,
      );

      // Then: the active start record alone still counts as In Progress.
      expect(timedStatus).toBe("in_progress");
    },
  );
});
