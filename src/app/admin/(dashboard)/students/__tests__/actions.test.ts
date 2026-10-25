import { type Db, ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real services backed by a per-test Mongo.
vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

// A real AuthService (for real registerStudent) is built per-test and exposed here.
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));

import { ACTIVE_SCHOOL_CHANGED_MESSAGE } from "src/lib/expected-school";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import {
  ALREADY_IN_SCHOOL_MESSAGE,
  addExistingStudentAction,
  createStudentAction,
  UNKNOWN_STUDENT_MESSAGE,
} from "../actions";
import {
  ADD_EXISTING_HINT,
  ImportOutcome,
  PreviewStatus,
} from "../bulk-import.types";
import {
  bulkImportStudentsAction,
  previewImportAction,
} from "../bulk-import-actions";

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

// Controllable admin gate, re-created each test.
let requireAdminSession: ReturnType<typeof vi.fn>;
let testDb: Db;

beforeEach(async () => {
  const { db } = await setupTestDb();
  testDb = db;
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
  // Override the gate so each test controls admin pass/fail; keep real registerStudent.
  (
    authService as unknown as { requireAdminSession: unknown }
  ).requireAdminSession = requireAdminSession;
  authHolder.authService = authService;
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: Bulk import — teacher previews a roster", () => {
  it("classifies each row by create/skip reason without creating students", async () => {
    // Given an existing student "taken"
    const { studentService } = getTestServices();
    await studentService.createStudentDocument({
      authUserId: "auth-taken",
      username: "taken",
      name: "Already Here",
      createdBy: "admin",
    });

    // When previewing a roster covering every status
    const result = await previewImportAction([
      { name: "Alice", username: "alice", password: "secret123" }, // valid
      { name: "", username: "bob", password: "secret123" }, // missing-field
      { name: "Cara", username: "cara", password: "short" }, // password-too-short
      { name: "Faye", username: "faye", password: "        " }, // password-blank (8 spaces)
      { name: "Dup One", username: "dup", password: "secret123" }, // dup-in-file
      { name: "Dup Two", username: "dup", password: "secret123" }, // dup-in-file
      { name: "Taker", username: "taken", password: "secret123" }, // already-exists
    ]);

    // Then each row carries its status and a summary, and nothing was written
    expect(result.success).toBe(true);
    expect(result.rows).toEqual([
      { name: "Alice", username: "alice", status: PreviewStatus.Valid },
      { name: "", username: "bob", status: PreviewStatus.MissingField },
      {
        name: "Cara",
        username: "cara",
        status: PreviewStatus.PasswordTooShort,
      },
      {
        name: "Faye",
        username: "faye",
        status: PreviewStatus.PasswordBlank,
      },
      { name: "Dup One", username: "dup", status: PreviewStatus.DupInFile },
      { name: "Dup Two", username: "dup", status: PreviewStatus.DupInFile },
      { name: "Taker", username: "taken", status: PreviewStatus.AlreadyExists },
    ]);
    expect(result.summary).toEqual({ total: 7, valid: 1, skipped: 6 });

    // Read-only: only the pre-seeded student exists
    const all = await studentService.listStudents();
    expect(all).toHaveLength(1);
  });

  it("rejects a non-admin caller", async () => {
    // Given the session is not an admin
    requireAdminSession.mockRejectedValue(
      new Error("Unauthorized: admin access required"),
    );

    // When previewing
    const result = await previewImportAction([
      { name: "Alice", username: "alice", password: "secret123" },
    ]);

    // Then it is refused with no preview
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    expect(result.rows).toBeUndefined();
  });

  it("rejects a roster larger than 200 rows", async () => {
    // Given 201 rows
    const rows = Array.from({ length: 201 }, (_, i) => ({
      name: `Student ${i}`,
      username: `user${i}`,
      password: "secret123",
    }));

    // When previewing
    const result = await previewImportAction(rows);

    // Then it is refused
    expect(result.success).toBe(false);
    expect(result.message).toContain("200");
    expect(result.rows).toBeUndefined();
  });
});

describe("Feature: Bulk import — teacher confirms the import", () => {
  it("creates valid students, enrolls them in selected courses, and reports per row", async () => {
    // Given an existing student "taken"
    const { studentService, courseService, enrollmentService } =
      getTestServices();
    await studentService.createStudentDocument({
      authUserId: "auth-taken",
      username: "taken",
      name: "Already Here",
      createdBy: "admin",
    });
    const course = await courseService.createCourse({
      title: "Course 1",
      description: "",
      createdBy: "admin",
    });

    // When importing a mixed roster into one course
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" }, // created
        { name: "Bob", username: "bob", password: "secret123" }, // created
        { name: "Cara", username: "cara", password: "short" }, // skipped: password-too-short
        { name: "Faye", username: "faye", password: "        " }, // skipped: password-blank
        { name: "Taker", username: "taken", password: "secret123" }, // skipped: already-exists
      ],
      [course.id],
      TEST_SCHOOL.id,
    );

    // Then the per-row report and summary reflect each outcome
    expect(result.success).toBe(true);
    expect(result.report).toEqual([
      { username: "alice", outcome: ImportOutcome.Created },
      { username: "bob", outcome: ImportOutcome.Created },
      {
        username: "cara",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.PasswordTooShort,
      },
      {
        username: "faye",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.PasswordBlank,
      },
      {
        username: "taken",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.AlreadyExists,
      },
    ]);
    expect(result.summary).toEqual({ created: 2, skipped: 3, failed: 0 });

    // The two new students are persisted (plus the pre-seeded one)
    const all = await studentService.listStudents();
    expect(all).toHaveLength(3);

    // Both created students are enrolled in the selected course
    const createdIds = all
      .filter((s) => s.username === "alice" || s.username === "bob")
      .map((s) => s.id)
      .sort();
    const enrolledIds = await enrollmentService.listEnrollmentsByCourse(
      course.id,
    );
    expect(enrolledIds.sort()).toEqual(createdIds);

    // The students list is revalidated
    expect(revalidatePath).toHaveBeenCalledWith("/admin/students");
  });

  it("enrolls created students into every selected course", async () => {
    // Given an empty system and two target courses
    const { studentService, courseService, enrollmentService } =
      getTestServices();
    const courseA = await courseService.createCourse({
      title: "Course A",
      description: "",
      createdBy: "admin",
    });
    const courseB = await courseService.createCourse({
      title: "Course B",
      description: "",
      createdBy: "admin",
    });

    // When importing two valid students into two courses
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" },
        { name: "Bob", username: "bob", password: "secret123" },
      ],
      [courseA.id, courseB.id],
      TEST_SCHOOL.id,
    );

    // Then both students are created
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ created: 2, skipped: 0, failed: 0 });

    // And both are enrolled in each selected course
    const all = await studentService.listStudents();
    const createdIds = all.map((s) => s.id).sort();
    const enrolledInA = await enrollmentService.listEnrollmentsByCourse(
      courseA.id,
    );
    const enrolledInB = await enrollmentService.listEnrollmentsByCourse(
      courseB.id,
    );
    expect(enrolledInA.sort()).toEqual(createdIds);
    expect(enrolledInB.sort()).toEqual(createdIds);
  });

  it("reports a Failed outcome when registerStudent throws for a valid row", async () => {
    // Given registerStudent fails for the second valid row only
    const { studentService, courseService, enrollmentService } =
      getTestServices();
    const course = await courseService.createCourse({
      title: "Course 1",
      description: "",
      createdBy: "admin",
    });
    const authService = authHolder.authService as {
      registerStudent: (input: {
        name: string;
        username: string;
        password: string;
        createdBy: string;
      }) => Promise<{ id: string; username: string; name: string }>;
    };
    const realRegister = authService.registerStudent.bind(authService);
    vi.spyOn(authService, "registerStudent").mockImplementation(
      async (input) => {
        if (input.username === "bob") {
          throw new Error("auth backend exploded");
        }
        return realRegister(input);
      },
    );

    // When importing two valid rows where the second errors
    const result = await bulkImportStudentsAction(
      [
        { name: "Alice", username: "alice", password: "secret123" }, // created
        { name: "Bob", username: "bob", password: "secret123" }, // fails
      ],
      [course.id],
      TEST_SCHOOL.id,
    );

    // Then the failing row is reported as Failed with the thrown reason
    expect(result.success).toBe(true);
    expect(result.report).toEqual([
      { username: "alice", outcome: ImportOutcome.Created },
      {
        username: "bob",
        outcome: ImportOutcome.Failed,
        reason: "auth backend exploded",
      },
    ]);
    expect(result.summary).toEqual({ created: 1, skipped: 0, failed: 1 });

    // And only the successfully-created student is persisted and enrolled
    const all = await studentService.listStudents();
    expect(all).toHaveLength(1);
    expect(all[0].username).toBe("alice");
    const enrolled = await enrollmentService.listEnrollmentsByCourse(course.id);
    expect(enrolled).toEqual([all[0].id]);
  });

  it("rejects a non-admin caller and writes nothing", async () => {
    // Given the session is not an admin
    requireAdminSession.mockRejectedValue(
      new Error("Unauthorized: admin access required"),
    );

    // When importing
    const result = await bulkImportStudentsAction(
      [{ name: "Alice", username: "alice", password: "secret123" }],
      [],
      TEST_SCHOOL.id,
    );

    // Then it is refused and no student is created
    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    const all = await getTestServices().studentService.listStudents();
    expect(all).toHaveLength(0);
  });
});

describe("Feature: Create Student names a taken username as a field error", () => {
  it("returns a username field error, not just the form-wide message", async () => {
    // Given a student already registered with "alice"
    const form1 = new FormData();
    form1.set("name", "Alice");
    form1.set("username", "alice");
    form1.set("password", "password123");
    form1.set("expectedSchoolId", TEST_SCHOOL.id);
    await createStudentAction(null, form1);

    // When a second admin tries to create another student with the same username
    const form2 = new FormData();
    form2.set("name", "Alice Two");
    form2.set("username", "alice");
    form2.set("password", "password123");
    form2.set("expectedSchoolId", TEST_SCHOOL.id);
    const result = await createStudentAction(null, form2);

    // Then the error names the username field, not only the banner
    expect(result.success).toBe(false);
    expect(result.fieldErrors?.username).toBe(
      `Username already exists. ${ADD_EXISTING_HINT}`,
    );
  });
});

describe("Feature: Create Student names a short password as a field error", () => {
  it("returns a password field error, not just the form-wide message", async () => {
    const form = new FormData();
    form.set("name", "Alice");
    form.set("username", "alice");
    form.set("password", "short");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createStudentAction(null, form);

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.password).toBe(
      "Password must be at least 8 characters",
    );
  });
});

describe("Feature: Create Student refuses a password made only of spaces", () => {
  it("returns a password field error and creates no student", async () => {
    const { studentService } = getTestServices();
    const form = new FormData();
    form.set("name", "Alice");
    form.set("username", "alice");
    // 8 spaces — passes the 8-character minimum, blank once trimmed
    form.set("password", "        ");
    form.set("expectedSchoolId", TEST_SCHOOL.id);

    const result = await createStudentAction(null, form);

    expect(result.success).toBe(false);
    expect(result.fieldErrors?.password).toBe("Password cannot be only spaces");
    expect(await studentService.listStudents()).toHaveLength(0);
  });
});

/**
 * Feature: a new student belongs to the admin's current school
 * As a school admin working in one school
 * I want a student I create, alone or by bulk import, to belong to that school
 * So that they sign in to that school and only its admins see them
 */
describe("Feature: a new student belongs to the admin's current school", () => {
  it("records the acting admin's school on a student created one at a time and by bulk import", async () => {
    const school = await addTestSchool("School B");
    requireAdminSession.mockResolvedValue({
      userId: "admin-b",
      role: "admin",
      school,
    });
    const form = new FormData();
    form.set("name", "Solo Student");
    form.set("username", "solo");
    form.set("password", "secret123");
    form.set("expectedSchoolId", school.id);

    await createStudentAction(null, form);
    await bulkImportStudentsAction(
      [{ name: "Batch Student", username: "batch", password: "secret123" }],
      [],
      school.id,
    );

    const { schoolDirectory } = getTestServices();
    expect((await schoolDirectory.findByUsername("solo"))?.schoolIds).toEqual([
      school.id,
    ]);
    expect((await schoolDirectory.findByUsername("batch"))?.schoolIds).toEqual([
      school.id,
    ]);
  });
});

/** Inserts a sign-in user and a student profile in the given school (none when null). */
async function seedStudent(
  schoolId: string | null,
  username: string,
  name: string,
) {
  const userId = new ObjectId();
  await testDb.collection("user").insertOne({
    _id: userId,
    email: `${username}@example.com`,
    name,
    role: "student",
  });
  const { studentService } = getTestServices(schoolId ?? TEST_SCHOOL.id);
  const student = await studentService.createStudentDocument({
    authUserId: userId.toHexString(),
    username,
    name,
    createdBy: "seed",
  });
  if (schoolId === null) {
    await testDb
      .collection("student")
      .updateOne({ id: student.id }, { $set: { schoolIds: [] } });
  }
  return student;
}

function addExistingForm(username: string, expectedSchoolId: string) {
  const form = new FormData();
  form.set("username", username);
  form.set("expectedSchoolId", expectedSchoolId);
  return form;
}

describe("Feature: a school admin adds an existing student to their school by username", () => {
  it("adds another school's student whatever the capitalisation, names them, and leaves their own school untouched", async () => {
    // Given Alice belongs to the default school and school B's admin is acting
    const alice = await seedStudent(TEST_SCHOOL.id, "alice", "Alice Nguyen");
    const schoolB = await addTestSchool("School B");
    requireAdminSession.mockResolvedValue({
      userId: "admin-b",
      role: "admin",
      school: schoolB,
    });

    // When the admin adds " ALICE "
    const result = await addExistingStudentAction(
      null,
      addExistingForm(" ALICE ", schoolB.id),
    );

    // Then the message names her and she is now in both schools
    expect(result.success).toBe(true);
    expect(result.message).toContain("Alice Nguyen");
    expect(result.message).toContain("alice");
    const inB = await getTestServices(schoolB.id).studentService.listStudents();
    expect(inB.map((student) => student.id)).toEqual([alice.id]);
    const stored =
      await getTestServices().schoolDirectory.findByUsername("alice");
    expect([...(stored?.schoolIds ?? [])].sort()).toEqual(
      [TEST_SCHOOL.id, schoolB.id].sort(),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/students");
  });
});

describe("Feature: adding an existing student refuses an unknown username", () => {
  it("says no such student and changes nothing", async () => {
    const result = await addExistingStudentAction(
      null,
      addExistingForm("nobody", TEST_SCHOOL.id),
    );

    expect(result).toEqual({
      success: false,
      message: UNKNOWN_STUDENT_MESSAGE,
    });
    expect(await getTestServices().studentService.listStudents()).toHaveLength(
      0,
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("Feature: adding an existing student refuses a student already in the school", () => {
  it("says they are already here and does not report an add", async () => {
    await seedStudent(TEST_SCHOOL.id, "alice", "Alice Nguyen");

    const result = await addExistingStudentAction(
      null,
      addExistingForm("alice", TEST_SCHOOL.id),
    );

    expect(result).toEqual({
      success: false,
      message: ALREADY_IN_SCHOOL_MESSAGE,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("Feature: adding an existing student refuses a form opened under a different school", () => {
  it("refuses a stale school and a missing school, and adds nobody", async () => {
    const alice = await seedStudent(TEST_SCHOOL.id, "alice", "Alice Nguyen");
    const schoolB = await addTestSchool("School B");
    requireAdminSession.mockResolvedValue({
      userId: "admin-b",
      role: "admin",
      school: schoolB,
    });

    // Given a form opened while the default school was active, and one with no school
    const stale = await addExistingStudentAction(
      null,
      addExistingForm("alice", TEST_SCHOOL.id),
    );
    const missing = new FormData();
    missing.set("username", "alice");
    const noSchool = await addExistingStudentAction(null, missing);

    // Then both are refused with the active-school message and Alice is unchanged
    expect(stale).toEqual({
      success: false,
      message: ACTIVE_SCHOOL_CHANGED_MESSAGE,
    });
    expect(noSchool).toEqual(stale);
    const stored =
      await getTestServices().schoolDirectory.findByUsername("alice");
    expect(stored?.schoolIds).toEqual([TEST_SCHOOL.id]);
    expect(stored?.id).toBe(alice.id);
  });
});

describe("Feature: a student who belongs to no school can be added by username", () => {
  it("lands the student in the admin's school", async () => {
    const orphan = await seedStudent(null, "orphan", "Orphan Student");

    const result = await addExistingStudentAction(
      null,
      addExistingForm("orphan", TEST_SCHOOL.id),
    );

    expect(result.success).toBe(true);
    const listed = await getTestServices().studentService.listStudents();
    expect(listed.map((student) => student.id)).toEqual([orphan.id]);
  });
});

describe("Feature: adding an existing student refuses an empty username and a non-admin caller", () => {
  it("refuses a blank username as unknown", async () => {
    const result = await addExistingStudentAction(
      null,
      addExistingForm("   ", TEST_SCHOOL.id),
    );

    expect(result).toEqual({
      success: false,
      message: UNKNOWN_STUDENT_MESSAGE,
    });
  });

  it("refuses a caller without an admin session and adds nobody", async () => {
    await seedStudent(null, "orphan", "Orphan Student");
    requireAdminSession.mockRejectedValue(new Error("no admin"));

    const result = await addExistingStudentAction(
      null,
      addExistingForm("orphan", TEST_SCHOOL.id),
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unauthorized");
    expect(await getTestServices().studentService.listStudents()).toHaveLength(
      0,
    );
  });
});

describe("Feature: bulk import compares usernames whatever their capitalisation", () => {
  it("previews a username that differs only in case from another school's student as already existing", async () => {
    // Given "alice" belongs to a student of another school
    const schoolB = await addTestSchool("School B");
    await seedStudent(schoolB.id, "alice", "Alice Nguyen");

    // When a roster row spells it "Alice"
    const result = await previewImportAction([
      { name: "Alice Again", username: "Alice", password: "secret123" },
    ]);

    // Then the row is skipped as already existing
    expect(result.rows).toEqual([
      {
        name: "Alice Again",
        username: "alice",
        status: PreviewStatus.AlreadyExists,
      },
    ]);
  });
});

describe("Feature: bulk import flags case variants within the same file", () => {
  it("previews both spellings as duplicates", async () => {
    const result = await previewImportAction([
      { name: "Bob One", username: "Bob", password: "secret123" },
      { name: "Bob Two", username: "bob", password: "secret123" },
    ]);

    expect(result.rows?.map((row) => row.status)).toEqual([
      PreviewStatus.DupInFile,
      PreviewStatus.DupInFile,
    ]);
  });

  it("confirm skips a case variant of an existing username and creates nobody", async () => {
    await seedStudent(TEST_SCHOOL.id, "alice", "Alice Nguyen");

    const result = await bulkImportStudentsAction(
      [{ name: "Alice Again", username: "ALICE", password: "secret123" }],
      [],
      TEST_SCHOOL.id,
    );

    expect(result.report).toEqual([
      {
        username: "alice",
        outcome: ImportOutcome.Skipped,
        reason: PreviewStatus.AlreadyExists,
      },
    ]);
    expect(result.summary).toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(await getTestServices().studentService.listStudents()).toHaveLength(
      1,
    );
  });
});
