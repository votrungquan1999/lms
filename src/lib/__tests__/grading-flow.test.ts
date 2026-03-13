import { AnswerService } from "src/lib/answer-service";
import { GradeService } from "src/lib/grade-service";
import { QuestionService } from "src/lib/question-service";
import { TestFeedbackService } from "src/lib/test-feedback-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Teacher Grades Student Answers
 * As a teacher
 * I want to grade student answers with scores and feedback
 * So that students receive structured evaluation on their work
 */

describe("Feature: Teacher Grades Student Answers", () => {
  describe("Scenario: Teacher grades questions", () => {
    dbIt(
      "should persist grade with score, feedback, and timestamp",
      async ({ db }) => {
        // Setup
        const testService = new TestService(db);
        const questionService = new QuestionService(db);
        const answerService = new AnswerService(db);
        const gradeService = new GradeService(db);

        const test = await testService.createTest("course-1", {
          title: "Midterm",
          description: "",
          createdBy: "admin-1",
        });
        const question = await questionService.addQuestion(test.id, {
          title: "Q1",
          content: "What is O(n)?",
          createdBy: "admin-1",
        });
        await answerService.submitAnswer({
          testId: test.id,
          questionId: question.id,
          studentId: "student-1",
          answer: "Linear time complexity",
        });

        // Action
        const grade = await gradeService.gradeQuestion({
          testId: test.id,
          questionId: question.id,
          studentId: "student-1",
          score: 75,
          feedback: "Good attempt, but missing Big-O formal definition",
          gradedBy: "admin-1",
        });

        // Assert
        expect(grade.testId).toBe(test.id);
        expect(grade.questionId).toBe(question.id);
        expect(grade.studentId).toBe("student-1");
        expect(grade.score).toBe(75);
        expect(grade.feedback).toBe(
          "Good attempt, but missing Big-O formal definition",
        );
        expect(grade.solution).toBeNull();
        expect(grade.gradedAt).toBeInstanceOf(Date);
      },
    );

    dbIt(
      "should store an optional solution per student-question",
      async ({ db }) => {
        // Setup
        const gradeService = new GradeService(db);

        // Action
        const grade = await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          score: 90,
          feedback: "Excellent",
          solution: "The correct answer is O(n) = linear time",
          gradedBy: "admin-1",
        });

        // Assert
        expect(grade.solution).toBe(
          "The correct answer is O(n) = linear time",
        );
        expect(grade.score).toBe(90);
      },
    );

    dbIt(
      "should update score and feedback when re-grading",
      async ({ db }) => {
        // Setup
        const gradeService = new GradeService(db);
        await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          score: 60,
          feedback: "Needs improvement",
          gradedBy: "admin-1",
        });

        // Action
        const updated = await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          score: 80,
          feedback: "Much better after discussion",
          gradedBy: "admin-1",
        });

        // Assert
        expect(updated.score).toBe(80);
        expect(updated.feedback).toBe("Much better after discussion");
      },
    );
  });

  describe("Scenario: Overall test feedback and average score", () => {
    dbIt(
      "should persist overall feedback at the test-student level",
      async ({ db }) => {
        // Setup
        const testFeedbackService = new TestFeedbackService(db);

        // Action
        await testFeedbackService.setTestFeedback({
          testId: "test-1",
          studentId: "student-1",
          feedback: "Overall great performance, keep it up!",
          gradedBy: "admin-1",
        });

        // Assert
        const feedback = await testFeedbackService.getTestFeedback(
          "test-1",
          "student-1",
        );
        expect(feedback).toBe("Overall great performance, keep it up!");
      },
    );

    dbIt(
      "should return average when all questions are graded",
      async ({ db }) => {
        // Setup
        const gradeService = new GradeService(db);
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
        await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-3",
          studentId: "student-1",
          score: 70,
          feedback: "",
          gradedBy: "admin-1",
        });

        // Action
        const average = await gradeService.getAverageScore(
          "test-1",
          "student-1",
          3,
        );

        // Assert
        expect(average).toBe(80);
      },
    );

    dbIt(
      "should return null when not all questions are graded",
      async ({ db }) => {
        // Setup
        const gradeService = new GradeService(db);
        await gradeService.gradeQuestion({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          score: 80,
          feedback: "",
          gradedBy: "admin-1",
        });

        // Action — 3 total questions, only 1 graded
        const average = await gradeService.getAverageScore(
          "test-1",
          "student-1",
          3,
        );

        // Assert
        expect(average).toBeNull();
      },
    );
  });
});
