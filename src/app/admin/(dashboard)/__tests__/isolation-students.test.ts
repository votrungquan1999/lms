import type { Db } from "mongodb";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { ensureIndexes } from "src/lib/database";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { TEST_SCHOOL } from "src/tests/create-test-db";
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
    expect(
      await getTestServices(
        school.id,
      ).enrollmentService.listEnrollmentsByCourse(course.id),
    ).toEqual([]);
  });

  it("setEnrollmentsAction saves new own-school enrollments while leaving an out-of-school enrollment untouched, submitted the way the dialog does", async () => {
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
    await own.enrollmentService.enrollStudent(
      course.id,
      outOfSchoolStudent.id,
      "admin-b",
    );
    const ownStudent = await own.studentService.createStudentDocument({
      authUserId: "auth-own-student",
      username: "own.student",
      name: "Own Student",
      createdBy: "admin-b",
    });
    signInAsSchool(school);
    // The dialog's shape: desired names both the pre-existing (out-of-school)
    // enrollment AND the new own-school one; observed carries every id the
    // dialog rendered when it opened.
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("studentIds", outOfSchoolStudent.id);
    formData.append("studentIds", ownStudent.id);
    formData.append("observedStudentIds", outOfSchoolStudent.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    const enrolled = await own.enrollmentService.listEnrollmentsByCourse(
      course.id,
    );
    expect(new Set(enrolled)).toEqual(
      new Set([outOfSchoolStudent.id, ownStudent.id]),
    );
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
    await own.enrollmentService.enrollStudent(
      course.id,
      outOfSchoolStudent.id,
      "admin-b",
    );
    signInAsSchool(school);
    // Crafted: desired is empty, but observed names the out-of-school
    // student — a legitimate dialog would use this shape to un-enroll them.
    const formData = new FormData();
    formData.set("courseId", course.id);
    formData.append("observedStudentIds", outOfSchoolStudent.id);

    const result = await setEnrollmentsAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      await own.enrollmentService.listEnrollmentsByCourse(course.id),
    ).toEqual([outOfSchoolStudent.id]);
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

    const result = await createStudentAction(null, formData);

    expect(result.success).toBe(true);
    expect(
      (await getTestServices(school.id).studentService.listStudents()).map(
        (s) => s.username,
      ),
    ).toEqual(["alice-own"]);
    expect(await getTestServices().studentService.listStudents()).toEqual([]);
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
