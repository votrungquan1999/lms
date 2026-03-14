import { AnswerService } from "src/lib/answer-service";
import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { GradeService } from "src/lib/grade-service";
import { QuestionService } from "src/lib/question-service";
import { TestFeedbackService } from "src/lib/test-feedback-service";
import { TestService } from "src/lib/test-service";
import { TestStatusService } from "src/lib/test-status-service";
import { TestSubmissionService } from "src/lib/test-submission-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Test Status and Submissions View
 * As a teacher or student
 * I want to see the status of each test
 * So that I know what has been completed and what needs attention
 */

describe("Feature: Test Status and Submissions View", () => {
  describe("Scenario: Test status derivation", () => {
    dbIt(
      "should return 'not_started' when student has no answers",
      async ({ db }) => {
        // Setup
        const testStatusService = new TestStatusService(
          new AnswerService(db),
          new TestSubmissionService(db),
          new GradeService(db),
        );

        // Action
        const status = await testStatusService.getStatus(
          "test-1",
          "student-1",
          3,
        );

        // Assert
        expect(status).toBe("not_started");
      },
    );

    dbIt(
      "should return 'in_progress' when student answered some questions",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);
        const testStatusService = new TestStatusService(
          answerService,
          new TestSubmissionService(db),
          new GradeService(db),
        );
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: "My answer",
        });

        // Action — 3 total questions, 1 answered
        const status = await testStatusService.getStatus(
          "test-1",
          "student-1",
          3,
        );

        // Assert
        expect(status).toBe("in_progress");
      },
    );

    dbIt(
      "should return 'submitted' when student answered all questions",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);
        const testStatusService = new TestStatusService(
          answerService,
          new TestSubmissionService(db),
          new GradeService(db),
        );
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: "Answer 1",
        });
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-2",
          studentId: "student-1",
          answer: "Answer 2",
        });

        // Action — 2 total questions, 2 answered
        const status = await testStatusService.getStatus(
          "test-1",
          "student-1",
          2,
        );

        // Assert
        expect(status).toBe("submitted");
      },
    );

    dbIt(
      "should return 'graded' when teacher graded all questions",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);
        const gradeService = new GradeService(db);
        const testStatusService = new TestStatusService(
          answerService,
          new TestSubmissionService(db),
          gradeService,
        );

        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: "Answer 1",
        });
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-2",
          studentId: "student-1",
          answer: "Answer 2",
        });
        await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          score: 80,
          feedback: "",
          gradedBy: "admin-1",
        });
        await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-2",
          studentId: "student-1",
          score: 90,
          feedback: "",
          gradedBy: "admin-1",
        });

        // Action — 2 total questions, 2 answered, 2 graded
        const status = await testStatusService.getStatus(
          "test-1",
          "student-1",
          2,
        );

        // Assert
        expect(status).toBe("graded");
      },
    );

    dbIt("should return 'submitted' when partially graded", async ({ db }) => {
      // Setup
      const answerService = new AnswerService(db);
      const gradeService = new GradeService(db);
      const testStatusService = new TestStatusService(
        answerService,
        new TestSubmissionService(db),
        gradeService,
      );

      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: "Answer 1",
      });
      await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-2",
        studentId: "student-1",
        answer: "Answer 2",
      });
      await gradeService.gradeQuestion({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        score: 80,
        feedback: "",
        gradedBy: "admin-1",
      });

      // Action — 2 total, 2 answered, only 1 graded
      const status = await testStatusService.getStatus(
        "test-1",
        "student-1",
        2,
      );

      // Assert
      expect(status).toBe("submitted");
    });
  });
});

describe("Feature: Full Grading Flow", () => {
  dbIt(
    "should support complete flow: submit → grade → retrieve grades and solutions",
    async ({ db }) => {
      // Setup services
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const answerService = new AnswerService(db);
      const gradeService = new GradeService(db);
      const testStatusService = new TestStatusService(
        answerService,
        new TestSubmissionService(db),
        gradeService,
      );

      // Admin creates course, test, questions
      const course = await courseService.createCourse({
        title: "Algorithms 101",
        description: "Intro to algorithms",
        createdBy: "admin-1",
      });
      const test = await testService.createTest(course.id, {
        title: "Quiz 1",
        description: "First quiz",
        createdBy: "admin-1",
      });
      const q1 = await questionService.addQuestion(test.id, {
        title: "Q1",
        content: "What is O(n)?",
        createdBy: "admin-1",
      });
      const q2 = await questionService.addQuestion(test.id, {
        title: "Q2",
        content: "Explain merge sort",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(course.id, "student-1", "admin-1");

      // Initially: not_started
      expect(await testStatusService.getStatus(test.id, "student-1", 2)).toBe(
        "not_started",
      );

      // Student submits one answer: in_progress
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        answer: "Linear time",
      });
      expect(await testStatusService.getStatus(test.id, "student-1", 2)).toBe(
        "in_progress",
      );

      // Student submits second answer: submitted
      await answerService.submitAnswer({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        answer: "Divide and conquer",
      });
      expect(await testStatusService.getStatus(test.id, "student-1", 2)).toBe(
        "submitted",
      );

      // Teacher grades with solutions
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q1.id,
        studentId: "student-1",
        score: 85,
        feedback: "Good, but be more precise",
        solution: "O(n) means linear time complexity",
        gradedBy: "admin-1",
      });
      await gradeService.gradeQuestion({
        testId: test.id,
        questionId: q2.id,
        studentId: "student-1",
        score: 75,
        feedback: "Missing key details",
        solution: "Merge sort: divide list, sort halves, merge",
        gradedBy: "admin-1",
      });

      // Teacher sets overall feedback
      const testFeedbackService = new TestFeedbackService(db);
      await testFeedbackService.setTestFeedback({
        testId: test.id,
        studentId: "student-1",
        feedback: "Good effort overall",
        gradedBy: "admin-1",
      });

      // Status: graded
      expect(await testStatusService.getStatus(test.id, "student-1", 2)).toBe(
        "graded",
      );

      // Verify grades retrievable
      const grades = await gradeService.getGrades(test.id, "student-1");
      expect(grades).toHaveLength(2);
      expect(grades.find((g) => g.questionId === q1.id)?.score).toBe(85);
      expect(grades.find((g) => g.questionId === q1.id)?.solution).toBe(
        "O(n) means linear time complexity",
      );

      // Verify average
      const average = await gradeService.getAverageScore(
        test.id,
        "student-1",
        2,
      );
      expect(average).toBe(80);

      // Verify overall feedback
      const overallFeedback = await testFeedbackService.getTestFeedback(
        test.id,
        "student-1",
      );
      expect(overallFeedback).toBe("Good effort overall");
    },
  );
});
