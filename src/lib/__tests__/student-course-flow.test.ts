import { AnswerService } from "src/lib/answer-service";
import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Student Course & Test Taking Flow
 * As a student
 * I want to see my enrolled courses, view tests, and submit answers
 * So that I can complete coursework
 */

describe("Feature: Student Course & Test Taking Flow", () => {
  describe("Scenario: Student views enrolled courses", () => {
    dbIt("should list all courses a student is enrolled in", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const courseA = await courseService.createCourse({
        title: "Course A",
        description: "",
        createdBy: "admin-1",
      });
      const courseB = await courseService.createCourse({
        title: "Course B",
        description: "",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(courseA.id, "student-1", "admin-1");
      await enrollmentService.enrollStudent(courseB.id, "student-1", "admin-1");

      // Action
      const enrollments =
        await enrollmentService.listEnrollmentsByStudent("student-1");

      // Assert
      expect(enrollments).toHaveLength(2);
      const courseIds = enrollments.map((e) => e.courseId);
      expect(courseIds).toContain(courseA.id);
      expect(courseIds).toContain(courseB.id);
    });

    dbIt(
      "should return empty array for student with no enrollments",
      async ({ db }) => {
        // Setup
        const enrollmentService = new EnrollmentService(db);

        // Action
        const enrollments =
          await enrollmentService.listEnrollmentsByStudent("student-none");

        // Assert
        expect(enrollments).toHaveLength(0);
      },
    );

    dbIt(
      "should fetch multiple courses by IDs in a single query",
      async ({ db }) => {
        // Setup
        const courseService = new CourseService(db);
        const courseA = await courseService.createCourse({
          title: "Course A",
          description: "",
          createdBy: "admin-1",
        });
        const courseB = await courseService.createCourse({
          title: "Course B",
          description: "",
          createdBy: "admin-1",
        });

        // Action
        const courses = await courseService.getCoursesByIds([
          courseA.id,
          courseB.id,
        ]);

        // Assert
        expect(courses).toHaveLength(2);
      },
    );

    dbIt(
      "should return empty array for getCoursesByIds with empty input",
      async ({ db }) => {
        // Setup
        const courseService = new CourseService(db);

        // Action
        const courses = await courseService.getCoursesByIds([]);

        // Assert
        expect(courses).toHaveLength(0);
      },
    );
  });

  describe("Scenario: Enrollment check", () => {
    dbIt("should return true when student is enrolled", async ({ db }) => {
      // Setup
      const enrollmentService = new EnrollmentService(db);
      await enrollmentService.enrollStudent("course-1", "student-1", "admin-1");

      // Action & Assert
      expect(await enrollmentService.isEnrolled("course-1", "student-1")).toBe(
        true,
      );
    });

    dbIt("should return false when student is not enrolled", async ({ db }) => {
      // Setup
      const enrollmentService = new EnrollmentService(db);

      // Action & Assert
      expect(await enrollmentService.isEnrolled("course-1", "student-1")).toBe(
        false,
      );
    });
  });

  describe("Scenario: Get test by ID", () => {
    dbIt("should return a test by its ID", async ({ db }) => {
      // Setup
      const testService = new TestService(db);
      const created = await testService.createTest("course-1", {
        title: "Midterm",
        description: "Covers chapters 1-5",
        createdBy: "admin-1",
      });

      // Action
      const found = await testService.getTest(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.title).toBe("Midterm");
      expect(found?.courseId).toBe("course-1");
    });

    dbIt("should return null for non-existent test ID", async ({ db }) => {
      // Setup
      const testService = new TestService(db);

      // Action
      const found = await testService.getTest("non-existent");

      // Assert
      expect(found).toBeNull();
    });
  });

  describe("Scenario: Student submits answers", () => {
    dbIt("should create a new answer record for a question", async ({ db }) => {
      // Setup
      const answerService = new AnswerService(db);

      // Action
      const answer = await answerService.submitAnswer({
        testId: "test-1",
        questionId: "q-1",
        studentId: "student-1",
        answer: { type: "free_text", text: "My answer to question 1" },
      });

      // Assert
      expect(answer.id).toBeDefined();
      expect(answer.testId).toBe("test-1");
      expect(answer.questionId).toBe("q-1");
      expect(answer.studentId).toBe("student-1");
      expect(answer.answer).toEqual({
        type: "free_text",
        text: "My answer to question 1",
      });
      expect(answer.submittedAt).toBeInstanceOf(Date);
    });

    dbIt(
      "should preserve answer history (append-only model)",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);
        const first = await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "First attempt" },
        });

        // Action — submit again with different answer (edit)
        const second = await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "Revised answer" },
        });

        // Assert — both records exist, different IDs
        expect(first.id).not.toBe(second.id);
        expect(second.answer).toEqual({
          type: "free_text",
          text: "Revised answer",
        });
      },
    );

    dbIt(
      "should skip insert when answer is identical to the latest",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "Same answer" },
        });

        // Action & Assert — submitting the same answer should throw
        await expect(
          answerService.submitAnswer({
            testId: "test-1",
            questionId: "q-1",
            studentId: "student-1",
            answer: { type: "free_text", text: "Same answer" },
          }),
        ).rejects.toThrow("Answer is unchanged");
      },
    );

    dbIt(
      "should return only the latest answer per question via getLatestAnswers",
      async ({ db }) => {
        // Setup
        const answerService = new AnswerService(db);

        // Submit two answers for q-1 (latest should be "Second")
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "First" },
        });
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-1",
          studentId: "student-1",
          answer: { type: "free_text", text: "Second" },
        });

        // Submit one answer for q-2
        await answerService.submitAnswer({
          testId: "test-1",
          questionId: "q-2",
          studentId: "student-1",
          answer: { type: "free_text", text: "Only attempt for q2" },
        });

        // Action
        const latest = await answerService.getLatestAnswers(
          "test-1",
          "student-1",
        );

        // Assert
        expect(latest).toHaveLength(2);
        const q1Answer = latest.find((a) => a.questionId === "q-1");
        const q2Answer = latest.find((a) => a.questionId === "q-2");
        expect(q1Answer?.answer).toEqual({ type: "free_text", text: "Second" });
        expect(q2Answer?.answer).toEqual({
          type: "free_text",
          text: "Only attempt for q2",
        });
      },
    );

    dbIt("should return empty array when no answers exist", async ({ db }) => {
      // Setup
      const answerService = new AnswerService(db);

      // Action
      const latest = await answerService.getLatestAnswers(
        "test-1",
        "student-1",
      );

      // Assert
      expect(latest).toHaveLength(0);
    });
  });

  describe("Scenario: Full student test-taking flow", () => {
    dbIt(
      "should support complete flow: enroll → view tests → submit answers",
      async ({ db }) => {
        // Setup services
        const courseService = new CourseService(db);
        const enrollmentService = new EnrollmentService(db);
        const testService = new TestService(db);
        const questionService = new QuestionService(db);
        const answerService = new AnswerService(db);

        // Admin creates a course with a test and questions
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

        // Admin enrolls student
        await enrollmentService.enrollStudent(
          course.id,
          "student-1",
          "admin-1",
        );

        // Student checks enrollment
        expect(await enrollmentService.isEnrolled(course.id, "student-1")).toBe(
          true,
        );

        // Student views tests
        const tests = await testService.listTests(course.id);
        expect(tests).toHaveLength(1);
        expect(tests[0].title).toBe("Quiz 1");

        // Student views questions
        const questions = await questionService.listQuestions(test.id);
        expect(questions).toHaveLength(2);

        // Student submits answers
        await answerService.submitAnswer({
          testId: test.id,
          questionId: q1.id,
          studentId: "student-1",
          answer: { type: "free_text", text: "Linear time complexity" },
        });
        await answerService.submitAnswer({
          testId: test.id,
          questionId: q2.id,
          studentId: "student-1",
          answer: { type: "free_text", text: "Divide and conquer algorithm" },
        });

        // Verify latest answers
        const latest = await answerService.getLatestAnswers(
          test.id,
          "student-1",
        );
        expect(latest).toHaveLength(2);
      },
    );
  });
});
