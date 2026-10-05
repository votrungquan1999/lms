import { EnrollmentService } from "src/lib/enrollment-service";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import {
  insertRawCourses,
  insertRawEnrollment,
  insertRawStudents,
} from "src/tests/raw-enrollment-seeds";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

const OTHER_SCHOOL_ID = "other-school";

/**
 * Feature: enrolments are read only within the service's school
 * As a school admin working in one school
 * I want every enrolment read to see only rows whose course and student are both my school's
 * So that a legacy enrolment crossing two schools never leaks into my counts or checks
 */
describe("Feature: enrolments are read only within the service's school", () => {
  dbIt(
    "listEnrollmentsByCourse returns nothing for another school's course, even when one of my students is enrolled in it",
    async ({ db }) => {
      await insertRawCourses(db, ["foreign-course"], OTHER_SCHOOL_ID);
      await insertRawStudents(db, ["own-student"]);
      await insertRawEnrollment(db, "foreign-course", "own-student");
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      const enrolled = await service.listEnrollmentsByCourse("foreign-course");

      expect(enrolled).toEqual([]);
    },
  );

  dbIt(
    "listEnrollmentsByStudent returns nothing for another school's student, even when enrolled in one of my courses",
    async ({ db }) => {
      await insertRawCourses(db, ["own-course"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      await insertRawEnrollment(db, "own-course", "foreign-student");
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      const enrollments =
        await service.listEnrollmentsByStudent("foreign-student");

      expect(enrollments).toEqual([]);
    },
  );

  dbIt(
    "isEnrolled is false for one of my students enrolled in another school's course",
    async ({ db }) => {
      await insertRawCourses(db, ["foreign-course"], OTHER_SCHOOL_ID);
      await insertRawStudents(db, ["own-student"]);
      await insertRawEnrollment(db, "foreign-course", "own-student");
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      const enrolled = await service.isEnrolled(
        "foreign-course",
        "own-student",
      );

      expect(enrolled).toBe(false);
    },
  );
});

/**
 * Feature: enrolments are written only within the service's school
 * As a school admin working in one school
 * I want every enrolment write to refuse another school's course or student
 * So that no in-app path can ever create an enrolment crossing two schools
 */
describe("Feature: enrolments are written only within the service's school", () => {
  dbIt(
    "enrollStudent refuses another school's course and writes nothing",
    async ({ db }) => {
      await insertRawCourses(db, ["foreign-course"], OTHER_SCHOOL_ID);
      await insertRawStudents(db, ["own-student"]);
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.enrollStudent("foreign-course", "own-student", "admin-1"),
      ).rejects.toThrow("Course not found");
      expect(await db.collection("enrollment").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "enrollStudent refuses another school's student and writes nothing",
    async ({ db }) => {
      await insertRawCourses(db, ["own-course"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.enrollStudent("own-course", "foreign-student", "admin-1"),
      ).rejects.toThrow("Student not found");
      expect(await db.collection("enrollment").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "enrollStudents refuses another school's course and writes nothing",
    async ({ db }) => {
      await insertRawCourses(db, ["foreign-course"], OTHER_SCHOOL_ID);
      await insertRawStudents(db, ["own-student"]);
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.enrollStudents("foreign-course", ["own-student"], "admin-1"),
      ).rejects.toThrow("Course not found");
      expect(await db.collection("enrollment").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "enrollStudents refuses a batch naming another school's student and enrols nobody from it",
    async ({ db }) => {
      await insertRawCourses(db, ["own-course"]);
      await insertRawStudents(db, ["own-student"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.enrollStudents(
          "own-course",
          ["own-student", "foreign-student"],
          "admin-1",
        ),
      ).rejects.toThrow("Student not found");
      expect(await db.collection("enrollment").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "setEnrolledStudents refuses another school's course and leaves its enrolments as they are",
    async ({ db }) => {
      await insertRawCourses(db, ["foreign-course"], OTHER_SCHOOL_ID);
      await insertRawStudents(db, ["own-student"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      await insertRawEnrollment(db, "foreign-course", "foreign-student");
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.setEnrolledStudents("foreign-course", {
          desired: ["own-student"],
          observed: ["foreign-student"],
          updatedBy: "admin-1",
        }),
      ).rejects.toThrow("Course not found");
      const rows = await db
        .collection("enrollment")
        .find({ courseId: "foreign-course" })
        .toArray();
      expect(rows.map((row) => row.studentId)).toEqual(["foreign-student"]);
    },
  );

  dbIt(
    "setEnrolledStudents refuses a save adding another school's student and enrols nobody from it",
    async ({ db }) => {
      await insertRawCourses(db, ["own-course"]);
      await insertRawStudents(db, ["own-student"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await expect(
        service.setEnrolledStudents("own-course", {
          desired: ["own-student", "foreign-student"],
          observed: [],
          updatedBy: "admin-1",
        }),
      ).rejects.toThrow("Student not found");
      expect(await db.collection("enrollment").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "setEnrolledStudents never un-enrols another school's student, even when the save observes them",
    async ({ db }) => {
      await insertRawCourses(db, ["own-course"]);
      await insertRawStudents(db, ["foreign-student"], OTHER_SCHOOL_ID);
      await insertRawEnrollment(db, "own-course", "foreign-student");
      const service = new EnrollmentService(db, TEST_SCHOOL_ID);

      await service.setEnrolledStudents("own-course", {
        desired: [],
        observed: ["foreign-student"],
        updatedBy: "admin-1",
      });

      expect(
        await db.collection("enrollment").countDocuments({
          courseId: "own-course",
          studentId: "foreign-student",
        }),
      ).toBe(1);
    },
  );
});
