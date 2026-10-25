import type { Db } from "mongodb";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { ensureIndexes } from "src/lib/database";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import { insertRawEnrollment } from "src/tests/raw-enrollment-seeds";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// A real AuthService (for real registerStudent) is built per-test and exposed here.
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));

import { setEnrollmentsAction } from "../courses/[courseId]/actions";
import { createStudentAction } from "../students/actions";
import { PreviewStatus } from "../students/bulk-import.types";
import {
  bulkImportStudentsAction,
  previewImportAction,
} from "../students/bulk-import-actions";

const testConfig: AppConfig = {
  mongodbUri: "unused-in-test",
  authSecret: "test-secret",
  authAllowedHosts: ["localhost:3000"],
  google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  s3: {
    bucket: "test-bucket",
    region: "ap-southeast-1",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  },
  adminEmails: [],
  trustedOrigins: [],
  allowPublicSignUp: false,
};

interface School {
  id: string;
  name: string;
}

// Controllable admin gate, re-created each test.
let requireAdminSession: ReturnType<typeof vi.fn>;
let db: Db;

beforeEach(async () => {
  ({ db } = await setupTestDb());
  const authService = createAuthService(
    db,
    testConfig,
    realAuthServiceDeps(db),
  );
  requireAdminSession = vi.fn().mockResolvedValue({
    userId: "admin-1",
    role: "admin",
    school: TEST_SCHOOL,
  });
  (
    authService as unknown as { requireAdminSession: unknown }
  ).requireAdminSession = requireAdminSession;
  authHolder.authService = authService;
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/** Signs the harness's admin gate in as the given (non-default) school's admin. */
function signInAsSchool(school: School): void {
  requireAdminSession.mockResolvedValue({
    userId: "admin-b",
    role: "admin",
    school,
  });
}

/**
 * Feature: a school admin can never see or enrol another school's students,
 * and a bulk import that names another school's course is refused before
 * anyone is created
 * As a school admin working in one school
 * I want another school's student or course ids to be refused
 * So that another school's roster can never be touched or read through mine
 */
describe("Feature: a school admin can never see or enrol another school's students", () => {
  it("setEnrollmentsAction refuses a foreign student and enrolls nobody", async () => {
    const school = await addTestSchool("School B");
    const course = await getTestServices(school.id).courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const foreignStudent =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign-student",
        username: "foreign.student",
        name: "Foreign Student",
        createdBy: "default-school-admin",
      });
    signInAsSchool(school);
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", foreignStudent.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result).toEqual({
      success: false,
      message: "One or more selected students were not found.",
    });
    // Counted raw: the school-bound listing would hide a leaked foreign row.
    expect(
      await db.collection("enrollment").countDocuments({ courseId: course.id }),
    ).toBe(0);
  });

  it("setEnrollmentsAction saves a new own-school enrollment while leaving an out-of-school enrollment untouched, submitted the way the dialog does", async () => {
    const school = await addTestSchool("School B");
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const outOfSchoolStudent =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-out-of-school",
        username: "out.of.school",
        name: "Out Of School Student",
        createdBy: "default-school-admin",
      });
    await insertRawEnrollment(db, course.id, outOfSchoolStudent.id);
    const ownStudent = await own.studentService.createStudentDocument({
      authUserId: "auth-own-student",
      username: "own.student",
      name: "Own Student",
      createdBy: "admin-b",
    });
    signInAsSchool(school);
    // The dialog's shape: it is never handed the out-of-school id, so it
    // posts only the newly ticked own-school student and observes nobody.
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", ownStudent.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await own.enrollmentService.listEnrollmentsByCourse(course.id),
    ).toEqual([ownStudent.id]);
    expect(
      await db.collection("enrollment").countDocuments({
        courseId: course.id,
        studentId: outOfSchoolStudent.id,
      }),
    ).toBe(1);
  });

  it("setEnrollmentsAction never un-enrolls an out-of-school student even when a crafted request omits them from desired but observes them", async () => {
    const school = await addTestSchool("School B");
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const outOfSchoolStudent =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-out-of-school-2",
        username: "out.of.school.2",
        name: "Out Of School Student",
        createdBy: "default-school-admin",
      });
    await insertRawEnrollment(db, course.id, outOfSchoolStudent.id);
    signInAsSchool(school);
    // Crafted: desired is empty, but observed names the out-of-school
    // student — a legitimate dialog would use this shape to un-enroll them.
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("observedStudentIds", outOfSchoolStudent.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await db.collection("enrollment").countDocuments({
        courseId: course.id,
        studentId: outOfSchoolStudent.id,
      }),
    ).toBe(1);
  });

  it("setEnrollmentsAction still enrolls a student that belongs to the admin's own school", async () => {
    const school = await addTestSchool("School B");
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const student = await own.studentService.createStudentDocument({
      authUserId: "auth-own-student-2",
      username: "own.student.2",
      name: "Own Student",
      createdBy: "admin-b",
    });
    signInAsSchool(school);
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", student.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await own.enrollmentService.listEnrollmentsByCourse(course.id),
    ).toEqual([student.id]);
  });

  it("setEnrollmentsAction enrolls an own-school student once when a request names them twice", async () => {
    await ensureIndexes(db);
    const school = await addTestSchool("School B");
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const student = await own.studentService.createStudentDocument({
      authUserId: "auth-own-student-3",
      username: "own.student.3",
      name: "Own Student",
      createdBy: "admin-b",
    });
    signInAsSchool(school);
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", student.id);
    formData.append("studentIds", student.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await own.enrollmentService.listEnrollmentsByCourse(course.id),
    ).toEqual([student.id]);
  });

  it("bulkImportStudentsAction refuses when one of the named courses belongs to another school, and creates nobody", async () => {
    const school = await addTestSchool("School B");
    const ownCourse = await getTestServices(
      school.id,
    ).courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    const foreignCourse = await getTestServices().courseService.createCourse({
      title: "Foreign Course",
      description: "",
      createdBy: "default-school-admin",
    });
    signInAsSchool(school);

    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice-b", password: "secret123" }],
      [ownCourse.id, foreignCourse.id],
      school.id,
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "One or more selected courses were not found. Nothing was imported.",
    );
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
    expect(
      await getTestServices(
        school.id,
      ).enrollmentService.listEnrollmentsByCourse(ownCourse.id),
    ).toEqual([]);
  });

  it("bulkImportStudentsAction refuses a non-string courseId before creating any student", async () => {
    const school = await addTestSchool("School B");
    const own = getTestServices(school.id);
    await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "admin-b",
    });
    signInAsSchool(school);

    // Bypasses the string[] type at runtime — the kind of payload a raw POST
    // to the server action endpoint can send even though TS forbids it at
    // compile time. Left unvalidated, this operator object would reach
    // CourseService.getCourse's findOne filter and match ANY course with a
    // non-null id, letting the check below pass by accident.
    const injectedCourseIds = [{ $ne: null }] as unknown as string[];

    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice-c", password: "secret123" }],
      injectedCourseIds,
      school.id,
    );

    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "One or more selected courses were not found. Nothing was imported.",
    );
    expect(await db.collection("student").countDocuments()).toBe(0);
    expect(await db.collection("user").countDocuments()).toBe(0);
  });

  it("createStudentAction lands in the admin's own school", async () => {
    const school = await addTestSchool("School B");
    signInAsSchool(school);
    const formData = new FormData();
    formData.set("name", "Alice");
    formData.set("username", "alice-own");
    formData.set("password", "secret123");
    formData.set("expectedSchoolId", school.id);

    const result = await createStudentAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices(school.id).studentService.listStudents()).map(
        (s) => s.username,
      ),
    ).toEqual(["alice-own"]);
    expect(await getTestServices().studentService.listStudents()).toEqual([]);
  });

  it("a student added to a second school is listed and enrollable there, and still refused by a school they don't belong to", async () => {
    const schoolB = await addTestSchool("School B");
    const schoolC = await addTestSchool("School C");
    const inB = getTestServices(schoolB.id);
    const inC = getTestServices(schoolC.id);
    const student =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-multi-school",
        username: "multi.school",
        name: "Multi School",
        createdBy: "default-school-admin",
      });
    const courseB = await inB.courseService.createCourse({
      title: "B Course",
      description: "",
      createdBy: "admin-b",
    });
    const courseC = await inC.courseService.createCourse({
      title: "C Course",
      description: "",
      createdBy: "admin-c",
    });
    expect(await inB.studentService.addToSchool(student.id)).toBe(true);

    signInAsSchool(schoolB);
    const enrolInB = new FormData();
    enrolInB.set("courseId", courseB.id);
    enrolInB.append("studentIds", student.id);
    const enrolledInB = await setEnrollmentsAction(null, enrolInB);
    signInAsSchool(schoolC);
    const enrolInC = new FormData();
    enrolInC.set("courseId", courseC.id);
    enrolInC.append("studentIds", student.id);
    const refusedInC = await setEnrollmentsAction(null, enrolInC);

    expect(
      (await inB.studentService.listStudents()).map((s) => s.username),
    ).toEqual(["multi.school"]);
    expect(
      (await getTestServices().studentService.listStudents()).map(
        (s) => s.username,
      ),
    ).toEqual(["multi.school"]);
    expect(await inC.studentService.listStudents()).toEqual([]);
    expect(enrolledInB.success).toBe(true);
    expect(refusedInC).toEqual({
      success: false,
      message: "One or more selected students were not found.",
    });
    expect(
      await db
        .collection("enrollment")
        .countDocuments({ courseId: courseC.id }),
    ).toBe(0);
  });

  it("previewImportAction marks a username already taken in ANOTHER school as AlreadyExists", async () => {
    await getTestServices().studentService.createStudentDocument({
      authUserId: "auth-taken-elsewhere",
      username: "taken-elsewhere",
      name: "Default School Student",
      createdBy: "default-school-admin",
    });
    const school = await addTestSchool("School B");
    signInAsSchool(school);

    const result = await previewImportAction([
      { name: "Bob", username: "taken-elsewhere", password: "secret123" },
    ]);

    expect(result.success).toBe(true);
    expect(result.rows).toEqual([
      {
        name: "Bob",
        username: "taken-elsewhere",
        status: PreviewStatus.AlreadyExists,
      },
    ]);
  });
});
