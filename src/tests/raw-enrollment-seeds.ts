import type { Db } from "mongodb";
import type { CourseDocument } from "src/lib/course-service";
import type { EnrollmentDocument } from "src/lib/enrollment-service";
import type { StudentDocument } from "src/lib/student-service";
import { TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Raw-inserts minimal courses with literal ids, for enrolment suites that
 * name courses they never created through `CourseService`.
 * @param db - The test's isolated database.
 * @param ids - The literal course ids the suite enrols against.
 * @param schoolId - The owning school; the default test school when omitted.
 */
export async function insertRawCourses(
  db: Db,
  ids: string[],
  schoolId: string = TEST_SCHOOL_ID,
): Promise<void> {
  await db.collection<CourseDocument>("course").insertMany(
    ids.map((id) => ({
      id,
      title: id,
      description: "",
      createdAt: new Date(),
      createdBy: "seed",
      updatedAt: null,
      updatedBy: null,
      materials: [],
      inviteToken: null,
      schoolId,
    })),
  );
}

/**
 * Raw-inserts minimal students with literal ids, for enrolment suites that
 * name students they never created through `StudentService`.
 * @param db - The test's isolated database.
 * @param ids - The literal student ids the suite enrols.
 * @param schoolId - The owning school; the default test school when omitted.
 */
export async function insertRawStudents(
  db: Db,
  ids: string[],
  schoolId: string = TEST_SCHOOL_ID,
): Promise<void> {
  await db.collection<StudentDocument>("student").insertMany(
    ids.map((id) => ({
      id,
      authUserId: `auth-${id}`,
      username: id,
      name: id,
      createdAt: new Date(),
      createdBy: "seed",
      updatedAt: null,
      updatedBy: null,
      schoolId,
    })),
  );
}

/**
 * Raw-inserts an enrolment row as legacy data can hold it — the only way to
 * seed a course and student from different schools, which the school-bound
 * `EnrollmentService` refuses to write.
 * @param db - The test's isolated database.
 * @param courseId - The enrolled course.
 * @param studentId - The enrolled student.
 */
export async function insertRawEnrollment(
  db: Db,
  courseId: string,
  studentId: string,
): Promise<void> {
  await db.collection<EnrollmentDocument>("enrollment").insertOne({
    id: crypto.randomUUID(),
    courseId,
    studentId,
    enrolledAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
  });
}
