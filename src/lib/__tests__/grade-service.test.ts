/** biome-ignore-all lint/style/noNonNullAssertion: this is for test */
import { AnswerService } from "src/lib/answer-service";
import { CourseService } from "src/lib/course-service";
import { GradeService } from "src/lib/grade-service";
import {
  type MultiSelectQuestion,
  QuestionService,
  type SingleSelectQuestion,
} from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
import { TestSubmissionService } from "src/lib/test-submission-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("GradeService - Integration Tests", () => {
  dbIt(
    "should return weighted average of grades based on question weights",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "Test",
        description: "",
        createdBy: "admin",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Content 1",
        createdBy: "admin",
        type: "free_text",
        weight: 2,
      });

      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Content 2",
        createdBy: "admin",
        type: "free_text",
        weight: 1,
      });

      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 100,
        feedback: "",
        gradedBy: "teacher",
      });

      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        score: 0,
        feedback: "",
        gradedBy: "teacher",
      });

      const average = await gradeService.getAverageScore(test.id, "student-1");
      expect(average).toBe(67);
    },
  );

  dbIt(
    "autoGradeTest should correctly grade single_select and multi_select questions",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "Auto Grade Test",
        description: "",
        createdBy: "admin",
      });

      const qSingle = (await questionService.addQuestion(test.id, {
        title: "Q Single",
        content: "Content",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;

      const qMultiAll = (await questionService.addQuestion(test.id, {
        title: "Q Multi All",
        content: "Content",
        createdBy: "admin",
        type: "multi_select",
        mcGradingStrategy: "all_or_nothing",
        options: [
          { text: "X", isCorrect: true },
          { text: "Y", isCorrect: true },
          { text: "Z", isCorrect: false },
        ],
      })) as MultiSelectQuestion;

      const qMultiPartial = (await questionService.addQuestion(test.id, {
        title: "Q Multi Partial",
        content: "Content",
        createdBy: "admin",
        type: "multi_select",
        mcGradingStrategy: "partial",
        options: [
          { text: "1", isCorrect: true },
          { text: "2", isCorrect: true },
          { text: "3", isCorrect: false },
        ],
      })) as MultiSelectQuestion;

      const qFree = await questionService.addQuestion(test.id, {
        title: "Q Free",
        content: "Content",
        createdBy: "admin",
        type: "free_text",
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: qSingle.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [qSingle.options[0].id] },
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: qMultiAll.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [qMultiAll.options[0].id] }, // Only one correct out of 2 for all_or_nothing
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: qMultiPartial.id,
        studentId: "student-1",
        answer: {
          type: "mc",
          selectedIds: [
            qMultiPartial.options[0].id,
            qMultiPartial.options[2].id,
          ],
        }, // 1 correct, 1 wrong -> 0
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: qFree.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "hello" },
      });

      const grades = await gradeService.autoGradeTest(test.id, "student-1");

      expect(grades).toHaveLength(3);

      const gradeSingle = grades.find((g) => g.questionId === qSingle.id);
      expect(gradeSingle?.score).toBe(100);

      const gradeMultiAll = grades.find((g) => g.questionId === qMultiAll.id);
      expect(gradeMultiAll?.score).toBe(0);

      const gradeMultiPartial = grades.find(
        (g) => g.questionId === qMultiPartial.id,
      );
      expect(gradeMultiPartial?.score).toBe(0);

      await answerService.submitAnswer({
        testId: test.id,
        questionId: qMultiPartial.id,
        studentId: "student-2",
        answer: { type: "mc", selectedIds: [qMultiPartial.options[0].id] }, // 1 correct -> 50%
      });

      const grades2 = await gradeService.autoGradeTest(test.id, "student-2");
      const gradeMultiPartial2 = grades2.find(
        (g) => g.questionId === qMultiPartial.id,
      );
      expect(gradeMultiPartial2?.score).toBe(50);
    },
  );

  dbIt(
    "should persist grade with score, feedback, and timestamp",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "Midterm",
        description: "",
        createdBy: "admin-1",
      });
      const question = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "What is O(n)?",
        createdBy: "admin-1",
        type: "free_text",
      });
      await answerService.submitAnswer({
        testId: test.id,
        questionId: question.id,
        studentId: "student-1",
        answer: { type: "free_text", text: "Linear time complexity" },
      });

      const grade = await gradeService.gradeQuestion({
        testId: test.id,
        questionId: question.id,
        studentId: "student-1",
        score: 75,
        feedback: "Good attempt, but missing Big-O formal definition",
        gradedBy: "admin-1",
      });

      expect(grade.testId).toBe(test.id);
      expect(grade.questionId).toBe(question.id);
      expect(grade.studentId).toBe("student-1");
      expect(grade.score).toBe(75);
      expect(grade.feedback).toBe(
        "Good attempt, but missing Big-O formal definition",
      );
      expect(grade.gradedAt).toBeInstanceOf(Date);
    },
  );

  dbIt(
    "should store an optional solution per student-question",
    async ({ db }) => {
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, new TestService(db));

      const grade = await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 90,
        feedback: "Excellent",
        solution: "The correct answer is O(n) = linear time",
        gradedBy: "admin-1",
      });

      expect(grade.solution).toBe("The correct answer is O(n) = linear time");
      expect(grade.score).toBe(90);
    },
  );

  dbIt("should update score and feedback when re-grading", async ({ db }) => {
    const questionService = new QuestionService(db);
    const answerService = new AnswerService(db, questionService);
    const gradeService = new GradeService(db, questionService, answerService, new TestService(db));

    await gradeService.gradeQuestion({
      testId: "test-1",
      questionId: "q-1",
      studentId: "student-1",
      score: 60,
      feedback: "Needs improvement",
      gradedBy: "admin-1",
    });

    const updated = await gradeService.gradeQuestion({
      testId: "test-1",
      questionId: "q-1",
      studentId: "student-1",
      score: 80,
      feedback: "Much better after discussion",
      gradedBy: "admin-1",
    });

    expect(updated.score).toBe(80);
    expect(updated.feedback).toBe("Much better after discussion");
  });

  dbIt(
    "getStudentGrades & getStudentAverageScore should enforce visibility and atomic reveal",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const studentId = "student-vis";
      const testDoc = await testService.createTest("course-1", {
        title: "Vis Test",
        description: "",
        createdBy: "admin",
        showCorrectAnswerAfterSubmit: false,
        showGradeAfterSubmit: false,
      });

      // TestStatus imported up top

      const q1 = await questionService.addQuestion(testDoc.id, {
        title: "Q1",
        content: "Content 1",
        createdBy: "admin",
        type: "free_text",
        weight: 1,
      });

      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: q1.id,
        studentId,
        answer: { type: "free_text", text: "ans" },
      });

      await gradeService.gradeQuestion({
        testId: testDoc.id,
        questionId: q1.id,
        studentId,
        score: 90,
        feedback: "",
        gradedBy: "admin",
      });

      // Scenario 1: Not fully graded (e.g. TestStatus.Submitted) => returns empty despite grades existing
      const emptyGrades = await gradeService.getStudentGrades(
        testDoc.id,
        studentId,
        TestStatus.Submitted,
      );
      expect(emptyGrades).toEqual([]);
      const emptyAvg = await gradeService.getStudentAverageScore(
        testDoc.id,
        studentId,
        TestStatus.Submitted,
      );
      expect(emptyAvg).toBeNull();

      // Scenario 2: Fully graded, but visibility flags are off => returns empty
      const noVisGrades = await gradeService.getStudentGrades(
        testDoc.id,
        studentId,
        TestStatus.Graded,
      );
      expect(noVisGrades).toEqual([]);
      const noVisAvg = await gradeService.getStudentAverageScore(
        testDoc.id,
        studentId,
        TestStatus.Graded,
      );
      expect(noVisAvg).toBeNull();

      // Scenario 3: Fully graded, and grades are released manually later
      await testService.releaseGrades(testDoc.id, "admin");
      const visGrades = await gradeService.getStudentGrades(
        testDoc.id,
        studentId,
        TestStatus.Graded,
      );
      expect(visGrades.length).toBe(1);
      expect(visGrades[0].score).toBe(90);
      const visAvg = await gradeService.getStudentAverageScore(
        testDoc.id,
        studentId,
        TestStatus.Graded,
      );
      expect(visAvg).toBe(90);
    },
  );

  dbIt(
    "getStudentGrades should return empty when test is configured to not reveal grades after submit",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      // Test configured to NOT reveal grades automatically
      const testDoc = await testService.createTest("course-reveal", {
        title: "No Reveal Test",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
        showCorrectAnswerAfterSubmit: false,
      });

      const q1 = await questionService.addQuestion(testDoc.id, {
        title: "Q1",
        content: "Describe recursion.",
        createdBy: "admin",
        type: "free_text",
        weight: 1,
      });

      // Student submits an answer
      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: q1.id,
        studentId: "student-no-reveal",
        answer: { type: "free_text", text: "A function calling itself." },
      });

      // Admin grades the answer
      await gradeService.gradeQuestion({
        testId: testDoc.id,
        questionId: q1.id,
        studentId: "student-no-reveal",
        score: 85,
        feedback: "Correct.",
        gradedBy: "admin",
      });

      // Even though the test is fully graded (TestStatus.Graded),
      // the student should NOT see their grades because showGradeAfterSubmit is false
      // and the admin has not manually released them
      const grades = await gradeService.getStudentGrades(
        testDoc.id,
        "student-no-reveal",
        TestStatus.Graded,
      );
      expect(grades).toEqual([]);

      const avg = await gradeService.getStudentAverageScore(
        testDoc.id,
        "student-no-reveal",
        TestStatus.Graded,
      );
      expect(avg).toBeNull();
    },
  );
});

describe("GradeService - Atomic Reveal", () => {
  dbIt(
    "happy path: grades are hidden until all questions are graded (flags ON)",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);
      const testSubmissionService = new TestSubmissionService(db, gradeService);

      // Default settings: showGradeAfterSubmit=true, showCorrectAnswerAfterSubmit=true
      const testDoc = await testService.createTest("course-ar", {
        title: "Atomic Reveal Test",
        description: "",
        createdBy: "admin",
      });

      const qMC = (await questionService.addQuestion(testDoc.id, {
        title: "Q MC",
        content: "Pick one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
        weight: 1,
      })) as SingleSelectQuestion;

      const qFree = await questionService.addQuestion(testDoc.id, {
        title: "Q Free",
        content: "Explain.",
        createdBy: "admin",
        type: "free_text",
        weight: 1,
      });

      const correctOptId = qMC.options.find((o) => o.isCorrect)!.id;

      // Student answers both questions and submits
      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: qMC.id,
        studentId: "student-ar",
        answer: { type: "mc", selectedIds: [correctOptId] },
      });
      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: qFree.id,
        studentId: "student-ar",
        answer: { type: "free_text", text: "My essay answer." },
      });

      // submitTest auto-grades MC internally
      await testSubmissionService.submitTest(testDoc.id, "student-ar");

      // MC is silently graded, but status is still "submitted" (not all questions graded)
      // → grades must NOT be surfaced yet
      const gradesAfterSubmit = await gradeService.getStudentGrades(
        testDoc.id,
        "student-ar",
        TestStatus.Submitted,
      );
      expect(gradesAfterSubmit).toEqual([]);

      const avgAfterSubmit = await gradeService.getStudentAverageScore(
        testDoc.id,
        "student-ar",
        TestStatus.Submitted,
      );
      expect(avgAfterSubmit).toBeNull();

      // Teacher grades the free-text question → now all questions have a grade
      await gradeService.gradeQuestion({
        testId: testDoc.id,
        questionId: qFree.id,
        studentId: "student-ar",
        score: 80,
        feedback: "Good.",
        gradedBy: "admin",
      });

      // Now status would be Graded → full results visible
      const gradesAfterFullGrade = await gradeService.getStudentGrades(
        testDoc.id,
        "student-ar",
        TestStatus.Graded,
      );
      expect(gradesAfterFullGrade).toHaveLength(2);

      const mcGrade = gradesAfterFullGrade.find((g) => g.questionId === qMC.id);
      const freeGrade = gradesAfterFullGrade.find((g) => g.questionId === qFree.id);
      expect(mcGrade?.score).toBe(100);
      expect(freeGrade?.score).toBe(80);

      const avgAfterFullGrade = await gradeService.getStudentAverageScore(
        testDoc.id,
        "student-ar",
        TestStatus.Graded,
      );
      expect(avgAfterFullGrade).toBe(90); // (100 + 80) / 2, weight=1 each
    },
  );

  dbIt(
    "flags OFF: grades remain hidden even after all questions are graded, until admin releases",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);
      const testSubmissionService = new TestSubmissionService(db, gradeService);

      // Both reveal flags turned OFF
      const testDoc = await testService.createTest("course-ar2", {
        title: "Flags Off Test",
        description: "",
        createdBy: "admin",
        showGradeAfterSubmit: false,
        showCorrectAnswerAfterSubmit: false,
      });

      const qMC = (await questionService.addQuestion(testDoc.id, {
        title: "Q MC",
        content: "Pick one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;

      const qFree = await questionService.addQuestion(testDoc.id, {
        title: "Q Free",
        content: "Explain.",
        createdBy: "admin",
        type: "free_text",
      });

      const correctOptId = qMC.options.find((o) => o.isCorrect)!.id;

      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: qMC.id,
        studentId: "student-ar2",
        answer: { type: "mc", selectedIds: [correctOptId] },
      });
      await answerService.submitAnswer({
        testId: testDoc.id,
        questionId: qFree.id,
        studentId: "student-ar2",
        answer: { type: "free_text", text: "My essay." },
      });

      await testSubmissionService.submitTest(testDoc.id, "student-ar2");

      // Teacher grades free-text → all questions graded
      await gradeService.gradeQuestion({
        testId: testDoc.id,
        questionId: qFree.id,
        studentId: "student-ar2",
        score: 70,
        feedback: "Decent.",
        gradedBy: "admin",
      });

      // Even though status=Graded, flags are OFF → still hidden
      const gradesBeforeRelease = await gradeService.getStudentGrades(
        testDoc.id,
        "student-ar2",
        TestStatus.Graded,
      );
      expect(gradesBeforeRelease).toEqual([]);

      // Admin releases grades
      await testService.releaseGrades(testDoc.id, "admin");

      // Now visible
      const gradesAfterRelease = await gradeService.getStudentGrades(
        testDoc.id,
        "student-ar2",
        TestStatus.Graded,
      );
      expect(gradesAfterRelease).toHaveLength(2);
    },
  );
});

describe("GradeService - Auto-Grade Edge Cases", () => {
  dbIt(
    "multi_select partial with all correct and no wrong selected scores 100",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "Partial Full Correct",
        description: "",
        createdBy: "admin",
      });

      const q = (await questionService.addQuestion(test.id, {
        title: "Select all correct",
        content: "Pick.",
        createdBy: "admin",
        type: "multi_select",
        mcGradingStrategy: "partial",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
          { text: "C", isCorrect: false },
        ],
      })) as MultiSelectQuestion;

      const optA = q.options.find((o) => o.text === "A")!.id;
      const optB = q.options.find((o) => o.text === "B")!.id;

      // Student selects both correct options and nothing wrong
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [optA, optB] },
      });

      const grades = await gradeService.autoGradeTest(test.id, "student-1");

      expect(grades).toHaveLength(1);
      expect(grades[0].score).toBe(100);
    },
  );

  dbIt(
    "multi_select rejects an MC answer with no selected options",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);

      const test = await testService.createTest("course-1", {
        title: "Partial Empty",
        description: "",
        createdBy: "admin",
      });

      const q = await questionService.addQuestion(test.id, {
        title: "Select all correct",
        content: "Pick.",
        createdBy: "admin",
        type: "multi_select",
        mcGradingStrategy: "partial",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: true },
        ],
      });

      // Submitting with no selections must be rejected
      await expect(
        answerService.submitAnswer({
          testId: test.id,
          questionId: q.id,
          studentId: "student-1",
          answer: { type: "mc", selectedIds: [] },
        }),
      ).rejects.toThrow("at least one selected option");
    },
  );
});

describe("GradeService - Visibility Edge Cases", () => {
  dbIt(
    "getStudentGrades returns empty when showGradeAfterSubmit=true but one question is still ungraded",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      // Both reveal flags ON (default)
      const test = await testService.createTest("course-1", {
        title: "Partial Grade Test",
        description: "",
        createdBy: "admin",
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Content",
        createdBy: "admin",
        type: "free_text",
      });

      await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Content",
        createdBy: "admin",
        type: "free_text",
      });

      // Only grade Q1 — Q2 is still ungraded
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 80,
        feedback: "",
        gradedBy: "admin",
      });

      // Status is Submitted (not all questions graded) → grades must be hidden
      const grades = await gradeService.getStudentGrades(
        test.id,
        "student-1",
        TestStatus.Submitted,
      );
      expect(grades).toEqual([]);
    },
  );

  dbIt(
    "getStudentGrades returns empty when showGradeAfterSubmit=false until grades are explicitly released",
    async ({ db }) => {
      const courseService = new CourseService(db);
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const course = await courseService.createCourse({
        title: "Course",
        description: "Desc",
        createdBy: "admin",
      });

      // Test has grade/answer reveal disabled by default
      const test = await testService.createTest(course.id, {
        title: "Hidden Grades Test",
        description: "",
        createdBy: "admin",
        showCorrectAnswerAfterSubmit: false,
        showGradeAfterSubmit: false,
      });

      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Content 1",
        createdBy: "admin",
        type: "free_text",
        weight: 1,
      });

      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-flow",
        answer: { type: "free_text", text: "my answer" },
      });

      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-flow",
        score: 100,
        feedback: "",
        gradedBy: "admin",
      });

      // Grades not released yet → hidden even though status is Graded
      const hiddenGrades = await gradeService.getStudentGrades(
        test.id,
        "student-flow",
        TestStatus.Graded,
      );
      expect(hiddenGrades).toHaveLength(0);

      // Admin releases grades and correct answers
      await testService.releaseGrades(test.id, "admin");
      await testService.releaseCorrectAnswers(test.id, "admin");

      const updatedTest = await testService.getTest(test.id);
      expect(updatedTest?.gradesReleasedAt).toBeInstanceOf(Date);
      expect(updatedTest?.correctAnswersReleasedAt).toBeInstanceOf(Date);

      // After release → grades are visible
      const visibleGrades = await gradeService.getStudentGrades(
        test.id,
        "student-flow",
        TestStatus.Graded,
      );
      expect(visibleGrades).toHaveLength(1);
      expect(visibleGrades[0].score).toBe(100);
    },
  );

  dbIt(
    "getAverageScore returns null when no grades exist for the student",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "No Grade Test",
        description: "",
        createdBy: "admin",
      });

      await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "Content",
        createdBy: "admin",
        type: "free_text",
      });

      // No grades submitted at all
      const avg = await gradeService.getAverageScore(test.id, "student-1");
      expect(avg).toBeNull();
    },
  );
});

describe("GradeService - Re-grade Override", () => {
  dbIt(
    "manually re-grading an auto-graded MC question upserts the score correctly",
    async ({ db }) => {
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db, questionService);
      const gradeService = new GradeService(db, questionService, answerService, testService);

      const test = await testService.createTest("course-1", {
        title: "Re-grade Test",
        description: "",
        createdBy: "admin",
      });

      const q = (await questionService.addQuestion(test.id, {
        title: "Q?",
        content: "Pick one.",
        createdBy: "admin",
        type: "single_select",
        options: [
          { text: "A", isCorrect: true },
          { text: "B", isCorrect: false },
        ],
      })) as SingleSelectQuestion;

      // Student selects the wrong answer → auto-grade = 0
      const optB = q.options.find((o) => o.text === "B")!.id;
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q.id,
        studentId: "student-1",
        answer: { type: "mc", selectedIds: [optB] },
      });

      const [autoGrade] = await gradeService.autoGradeTest(test.id, "student-1");
      expect(autoGrade.score).toBe(0);

      // Teacher overrides with partial credit
      const manual = await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q.id,
        studentId: "student-1",
        score: 50,
        feedback: "Partial credit for reasoning",
        gradedBy: "teacher-1",
      });

      expect(manual.score).toBe(50);
      expect(manual.feedback).toBe("Partial credit for reasoning");

      // Only one grade record exists (upsert, not insert)
      const allGrades = await gradeService.getGrades(test.id, "student-1");
      expect(allGrades).toHaveLength(1);
      expect(allGrades[0].score).toBe(50);
    },
  );
});
