import { CourseService } from "src/lib/course-service";
import { EnrollmentService } from "src/lib/enrollment-service";
import { TestService } from "src/lib/test-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Admin Course Management Flow
 * As an admin
 * I want to create courses, enroll students, and create tests
 * So that I can build educational content for my students
 *
 * Note: QuestionService behaviours (add/import/order) tested in question-service.test.ts
 */

describe("Feature: Admin Course Management Flow", () => {
  describe("Scenario: Admin manages courses", () => {
    dbIt(
      "should create a course with title and description",
      async ({ db }) => {
        const courseService = new CourseService(db);

        const course = await courseService.createCourse({
          title: "Introduction to Algorithms",
          description: "Learn fundamental algorithms",
          createdBy: "admin-1",
        });

        expect(course.id).toBeDefined();
        expect(course.title).toBe("Introduction to Algorithms");
        expect(course.description).toBe("Learn fundamental algorithms");
      },
    );

    dbIt(
      "should list courses in reverse chronological order",
      async ({ db }) => {
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

        const courses = await courseService.listCourses();

        expect(courses).toHaveLength(2);
        expect(courses[0].title).toBe("Course B");
        expect(courses[1].title).toBe("Course A");
      },
    );

    dbIt("should get a course by ID", async ({ db }) => {
      const courseService = new CourseService(db);
      const created = await courseService.createCourse({
        title: "My Course",
        description: "desc",
        createdBy: "admin-1",
      });

      const found = await courseService.getCourse(created.id);

      expect(found).not.toBeNull();
      expect(found?.title).toBe("My Course");
    });
  });

  describe("Scenario: Admin manages enrollment", () => {
    dbIt("should enroll a student without error", async ({ db }) => {
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });

      await enrollmentService.enrollStudent(course.id, "student-123", "admin-1");
    });

    dbIt("should throw when enrolling a duplicate student", async ({ db }) => {
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(course.id, "student-123", "admin-1");

      await expect(
        enrollmentService.enrollStudent(course.id, "student-123", "admin-1"),
      ).rejects.toThrow("Student is already enrolled in this course");
    });

    dbIt("should bulk enroll students and skip duplicates", async ({ db }) => {
      const courseService = new CourseService(db);
      const enrollmentService = new EnrollmentService(db);
      const course = await courseService.createCourse({
        title: "Test Course",
        description: "",
        createdBy: "admin-1",
      });
      await enrollmentService.enrollStudent(course.id, "student-1", "admin-1");

      const result = await enrollmentService.enrollStudents(
        course.id,
        ["student-1", "student-2", "student-3"],
        "admin-1",
      );

      expect(result.enrolled).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe("Scenario: Admin manages tests", () => {
    dbIt("should create a test associated with a course", async ({ db }) => {
      const courseService = new CourseService(db);
      const testService = new TestService(db);
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });

      const test = await testService.createTest(course.id, {
        title: "Midterm Exam",
        description: "Covers chapters 1-5",
        createdBy: "admin-1",
      });

      expect(test.id).toBeDefined();
      expect(test.courseId).toBe(course.id);
      expect(test.title).toBe("Midterm Exam");
    });

    dbIt("should list only tests for the specified course", async ({ db }) => {
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

      const testsA = await testService.listTests(courseA.id);

      expect(testsA).toHaveLength(1);
      expect(testsA[0].title).toBe("Test A1");
    });
  });
});
