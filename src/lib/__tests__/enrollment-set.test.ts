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

        // Action — dialog opened seeing nobody enrolled
        await service.setEnrolledStudents("course-1", {
          desired: ["student-a", "student-b"],
          observed: [],
          updatedBy: "admin-1",
        });

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

        // Action — dialog opened seeing [A, B]; set to [B, C]
        await service.setEnrolledStudents("course-1", {
          desired: ["student-b", "student-c"],
          observed: ["student-a", "student-b"],
          updatedBy: "admin-1",
        });

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

        // Action — dialog opened seeing [A, B]; set to [A, B] again
        await service.setEnrolledStudents("course-1", {
          desired: ["student-a", "student-b"],
          observed: ["student-a", "student-b"],
          updatedBy: "admin-1",
        });

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

        // Action — dialog opened seeing [A, B]; set to empty
        await service.setEnrolledStudents("course-1", {
          desired: [],
          observed: ["student-a", "student-b"],
          updatedBy: "admin-1",
        });

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

        // Action — dialog for course-1 opened seeing [A]; remove student-a from course-1 only
        await service.setEnrolledStudents("course-1", {
          desired: [],
          observed: ["student-a"],
          updatedBy: "admin-1",
        });

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

  describe("Scenario: a student enrolled while the dialog was open survives the save (BUG-2)", () => {
    dbIt(
      "should not remove a student who was enrolled after the admin's dialog snapshot was taken",
      async ({ db }) => {
        // Setup — the admin's dialog opens seeing only student-a enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        const observedStudentIds =
          await service.listEnrollmentsByCourse("course-1");

        // While the dialog sits open, someone else enrolls student-b — the
        // admin's form was rendered before this happened, so student-b can
        // be neither ticked nor unticked; it is simply absent from `desired`.
        await service.enrollStudent("course-1", "student-b", "admin-2");

        // Action — admin saves, keeping student-a checked (their only known state)
        await service.setEnrolledStudents("course-1", {
          desired: ["student-a"],
          observed: observedStudentIds,
          updatedBy: "admin-1",
        });

        // Assert — the surprise enrollment survives; the admin's own intent still applies
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toContain("student-a");
        expect(enrolled).toContain("student-b");
      },
    );
  });

  describe("Scenario: a removal and a mid-dialog survivor happen in the same save", () => {
    dbIt(
      "should remove an observed-but-unwanted student while a mid-dialog enrollment survives",
      async ({ db }) => {
        // Setup — the admin's dialog opens seeing student-a and student-c enrolled
        const service = new EnrollmentService(db);
        await service.enrollStudent("course-1", "student-a", "admin-1");
        await service.enrollStudent("course-1", "student-c", "admin-1");
        const observedStudentIds =
          await service.listEnrollmentsByCourse("course-1");

        // While the dialog sits open, someone else enrolls student-b
        await service.enrollStudent("course-1", "student-b", "admin-2");

        // Action — admin unticks student-c, keeps student-a
        await service.setEnrolledStudents("course-1", {
          desired: ["student-a"],
          observed: observedStudentIds,
          updatedBy: "admin-1",
        });

        // Assert — the observed removal actually happens, and the unobserved
        // enrollment isn't just accidentally spared by a no-op implementation
        const enrolled = await service.listEnrollmentsByCourse("course-1");
        expect(enrolled).toContain("student-a");
        expect(enrolled).toContain("student-b");
        expect(enrolled).not.toContain("student-c");
      },
    );
  });
});
