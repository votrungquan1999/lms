import { EnrollmentService } from "src/lib/enrollment-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Set Enrolled Students (idempotent batch update)
 * As an admin
 * I want to set the full list of enrolled students for a course
 * So that I can enroll and unenroll students in one operation
 */

describe("Feature: Set Enrolled Students", () => {
  describe("Scenario: Enroll students from empty state", () => {
    dbIt(
      "should enroll all specified students when none are currently enrolled",
      async ({ db }) => {
        // Setup
        const service = new EnrollmentService(db);

        // Action
        await service.setEnrolledStudents(
          "course-1",
          ["student-a", "student-b"],
          "admin-1",
        );

        // Assert
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toHaveLength(2);
        expect(enrolled).toContain("student-a");
        expect(enrolled).toContain("student-b");
      },
    );
  });

  describe("Scenario: Partial update — add and remove students", () => {
    dbIt(
      "should add new students and remove unselected students",
      async ({ db }) => {
        // Setup — [A, B] enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        await service.enrollStudent("course-1", "student-b", "admin-1");

        // Action — set to [B, C]
        await service.setEnrolledStudents(
          "course-1",
          ["student-b", "student-c"],
          "admin-1",
        );

        // Assert — A removed, B kept, C added
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toHaveLength(2);
        expect(enrolled).toContain("student-b");
        expect(enrolled).toContain("student-c");
        expect(enrolled).not.toContain("student-a");
      },
    );
  });

  describe("Scenario: No-op when list is unchanged", () => {
    dbIt(
      "should make no changes when the same student list is provided",
      async ({ db }) => {
        // Setup — [A, B] enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        await service.enrollStudent("course-1", "student-b", "admin-1");

        // Action — set to [A, B] again
        await service.setEnrolledStudents(
          "course-1",
          ["student-a", "student-b"],
          "admin-1",
        );

        // Assert — unchanged
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toHaveLength(2);
        expect(enrolled).toContain("student-a");
        expect(enrolled).toContain("student-b");
      },
    );
  });

  describe("Scenario: Unenroll all students", () => {
    dbIt(
      "should remove all enrolled students when empty list is provided",
      async ({ db }) => {
        // Setup — [A, B] enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        await service.enrollStudent("course-1", "student-b", "admin-1");

        // Action — set to empty
        await service.setEnrolledStudents("course-1", [], "admin-1");

        // Assert
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toHaveLength(0);
      },
    );
  });

  describe("Scenario: Does not affect other courses", () => {
    dbIt(
      "should only modify enrollments for the specified course",
      async ({ db }) => {
        // Setup — student-a enrolled in both courses
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        await service.enrollStudent("course-2", "student-a", "admin-1");

        // Action — remove student-a from course-1 only
        await service.setEnrolledStudents("course-1", [], "admin-1");

        // Assert — course-2 unaffected
        const course1Enrolled =
          await service.listEnrollmentsByCourse("course-1");
        const course2Enrolled =
          await service.listEnrollmentsByCourse("course-2");
        expect(course1Enrolled).toHaveLength(0);
        expect(course2Enrolled).toHaveLength(1);
        expect(course2Enrolled).toContain("student-a");
      },
    );
  });
});
