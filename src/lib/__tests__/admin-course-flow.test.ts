import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { QuestionService } from "src/lib/question-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Admin Course Management Flow
 * As an admin
 * I want to create courses, enroll students, create tests, and add questions
 * So that I can build educational content for my students
 */

describe("Feature: Admin Course Management Flow", () => {
  describe("Scenario: Admin manages courses", () => {
    dbIt(
      "should create a course with title and description",
      async ({ db }) => {
        // Setup
        const courseService = new CourseService(db);

        // Action
        const course = await courseService.createCourse({
          title: "Introduction to Algorithms",
          description: "Learn fundamental algorithms",
          createdBy: "admin-1",
        });

        // Assert
        expect(course.id).toBeDefined();
        expect(course.title).toBe("Introduction to Algorithms");
        expect(course.description).toBe("Learn fundamental algorithms");
      },
    );

    dbIt(
      "should list courses in reverse chronological order",
      async ({ db }) => {
        // Setup
        const courseService = new CourseService(db);
        await courseService.createCourse({
          title: "Course A",
          description: "",
          createdBy: "admin-1",
        });
        await courseService.createCourse({
          title: "Course B",
          description: "",
          createdBy: "admin-1",
        });

        // Action
        const courses = await courseService.listCourses();

        // Assert
        expect(courses).toHaveLength(2);
        expect(courses[0].title).toBe("Course B");
        expect(courses[1].title).toBe("Course A");
      },
    );

    dbIt("should get a course by ID", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const created = await courseService.createCourse({
        title: "My Course",
        description: "desc",
        createdBy: "admin-1",
      });

      // Action
      const found = await courseService.getCourse(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.title).toBe("My Course");
    });
  });

  describe("Scenario: Admin manages enrollment", () => {
    dbIt("should enroll a student without error", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });

      // Action & Assert — should not throw
      await enrollmentService.enrollStudent(
        course.id,
        "student-123",
        "admin-1",
      );
    });

    dbIt("should throw when enrolling a duplicate student", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(
        course.id,
        "student-123",
        "admin-1",
      );

      // Action & Assert
      await expect(
        enrollmentService.enrollStudent(course.id, "student-123", "admin-1"),
      ).rejects.toThrow("Student is already enrolled in this course");
    });

    dbIt("should bulk enroll students and skip duplicates", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(course.id, "student-1", "admin-1");

      // Action
      const result = await enrollmentService.enrollStudents(
        course.id,
        ["student-1", "student-2", "student-3"],
        "admin-1",
      );

      // Assert
      expect(result.enrolled).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe("Scenario: Admin manages tests", () => {
    dbIt("should create a test associated with a course", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const testService = new TestService(db);
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });

      // Action
      const test = await testService.createTest(course.id, {
        title: "Midterm Exam",
        description: "Covers chapters 1-5",
        createdBy: "admin-1",
      });

      // Assert
      expect(test.id).toBeDefined();
      expect(test.courseId).toBe(course.id);
      expect(test.title).toBe("Midterm Exam");
    });

    dbIt("should list only tests for the specified course", async ({ db }) => {
      // Setup
      const courseService = new CourseService(db);
      const testService = new TestService(db);
      const courseA = await courseService.createCourse({
        title: "A",
        description: "",
        createdBy: "admin-1",
      });
      const courseB = await courseService.createCourse({
        title: "B",
        description: "",
        createdBy: "admin-1",
      });
      await testService.createTest(courseA.id, {
        title: "Test A1",
        description: "",
        createdBy: "admin-1",
      });
      await testService.createTest(courseB.id, {
        title: "Test B1",
        description: "",
        createdBy: "admin-1",
      });

      // Action
      const testsA = await testService.listTests(courseA.id);

      // Assert
      expect(testsA).toHaveLength(1);
      expect(testsA[0].title).toBe("Test A1");
    });
  });

  describe("Scenario: Admin adds questions with markdown content", () => {
    dbIt("should add a question with raw markdown content", async ({ db }) => {
      // Setup
      const testService = new TestService(db);
      const questionService = new QuestionService(db);
      const test = await testService.createTest("course-1", {
        title: "Midterm",
        description: "",
        createdBy: "admin-1",
      });

      const markdownContent = `## Question 1

Write a function that sorts an array using **merge sort**.

\`\`\`python
def merge_sort(arr):
    # Your code here
    pass
\`\`\``;

      // Action
      const question = await questionService.addQuestion(test.id, {
        title: "Merge Sort Implementation",
        content: markdownContent,
        createdBy: "admin-1",
      });

      // Assert
      expect(question.id).toBeDefined();
      expect(question.title).toBe("Merge Sort Implementation");
      expect(question.content).toBe(markdownContent);
      expect(question.order).toBe(1);
    });

    dbIt("should assign increasing order numbers", async ({ db }) => {
      // Setup
      const questionService = new QuestionService(db);

      // Action
      const q1 = await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "First",
        createdBy: "admin-1",
      });
      const q2 = await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Second",
        createdBy: "admin-1",
      });

      // Assert
      expect(q1.order).toBe(1);
      expect(q2.order).toBe(2);
    });

    dbIt("should list questions ordered by order field", async ({ db }) => {
      // Setup
      const questionService = new QuestionService(db);
      await questionService.addQuestion("test-1", {
        title: "Q1",
        content: "First",
        createdBy: "admin-1",
      });
      await questionService.addQuestion("test-1", {
        title: "Q2",
        content: "Second",
        createdBy: "admin-1",
      });

      // Action
      const questions = await questionService.listQuestions("test-1");

      // Assert
      expect(questions).toHaveLength(2);
      expect(questions[0].order).toBe(1);
      expect(questions[1].order).toBe(2);
    });
  });

  describe("Scenario: Admin imports questions from JSON", () => {
    dbIt(
      "should bulk import questions with correct ordering",
      async ({ db }) => {
        // Setup
        const questionService = new QuestionService(db);

        // Action
        const imported = await questionService.importQuestions(
          "test-1",
          [
            { title: "Imported Q1", content: "## First\nContent" },
            { title: "Imported Q2", content: "## Second\nContent" },
            { title: "Imported Q3", content: "## Third\nContent" },
          ],
          "admin-1",
        );

        // Assert
        expect(imported).toHaveLength(3);
        expect(imported[0].title).toBe("Imported Q1");
        expect(imported[0].order).toBe(1);
        expect(imported[2].order).toBe(3);
      },
    );

    dbIt(
      "should continue ordering after existing questions",
      async ({ db }) => {
        // Setup
        const questionService = new QuestionService(db);
        await questionService.addQuestion("test-1", {
          title: "Existing",
          content: "Already here",
          createdBy: "admin-1",
        });

        // Action
        const imported = await questionService.importQuestions(
          "test-1",
          [{ title: "New", content: "From JSON" }],
          "admin-1",
        );

        // Assert
        expect(imported[0].order).toBe(2);
        const all = await questionService.listQuestions("test-1");
        expect(all).toHaveLength(2);
      },
    );

    dbIt("should return empty array when importing nothing", async ({ db }) => {
      // Setup
      const questionService = new QuestionService(db);

      // Action
      const result = await questionService.importQuestions(
        "test-1",
        [],
        "admin-1",
      );

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
