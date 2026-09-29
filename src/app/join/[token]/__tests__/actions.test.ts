import type { Db } from "mongodb";
import { type AuthService, createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import {
  type CourseJoinRequestDocument,
  JoinRequestStatus,
} from "src/lib/course-join-request-service";
import { ensureIndexes } from "src/lib/database";
import { StudentSession } from "src/lib/session";
import type { StudentDocument } from "src/lib/student-service";
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

// A real AuthService (for real registerStudent/signInStudent) built per-test.
// googleUsernameSignupAction's tests stub resolveUnclassifiedIdentity
// directly on this same instance via vi.spyOn, rather than driving a real
// Google-shaped cookie round trip — that resolution path is already fully
// covered by auth-service.test.ts.
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { headers } from "next/headers";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { TEST_SCHOOL_ID } from "src/tests/create-test-db";
import {
  googleUsernameSignupAction,
  joinSignupAction,
  requestToJoinAction,
} from "../actions";

// The synthetic email a self-registrant with username "ada" would get is
// pre-listed here on purpose — proves the ADMIN_EMAILS list alone can never
// grant admin to a self-registrant (D15/D23/D24: role is a recorded fact,
// never inferred from the email string).
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
  adminEmails: ["ada@lms.internal"],
  trustedOrigins: [],
  allowPublicSignUp: false,
};

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  authHolder.authService = createAuthService(
    db,
    testConfig,
    realAuthServiceDeps(db),
  );
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

/**
 * Feature: a prospective student can create their own account from the
 * invite page and sign in with it afterwards
 * As a prospective student
 * I want to pick my own username and password from the invite link
 * So that I can access the school without an admin creating my account
 */
describe("Feature: a prospective student can create their own account from the invite page and sign in with it afterwards", () => {
  it("creates a student account that signs in afterward, with no admin access even though the synthetic email is admin-listed", async () => {
    // Given a course with a live invite link
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Ada Lovelace");
    formData.set("username", "ada");
    formData.set("password", "secret1234");

    // When a prospective student submits the self-signup form
    const result = await joinSignupAction(null, formData);

    // Then the account is created
    expect(result.success).toBe(true);

    // And the same credentials sign in afterward
    const authService = authHolder.authService as {
      signInStudent: (input: {
        username: string;
        password: string;
      }) => Promise<{ user: unknown; token: unknown }>;
    };
    const session = await authService.signInStudent({
      username: "ada",
      password: "secret1234",
    });
    expect(session.user).toBeDefined();

    // And the account never carries admin access, regardless of ADMIN_EMAILS
    const userDoc = await db
      .collection("user")
      .findOne({ email: "ada@lms.internal" });
    expect(userDoc).not.toBeNull();
    expect(userDoc?.role).toBe("student");
  });
});

/**
 * Feature: registering through an invite link puts a request to join that
 * course in front of the admins
 * As a prospective student
 * I want my self-registration to also ask to join the course behind the link
 * So that an admin can review and approve my access
 */
describe("Feature: registering through an invite link puts a request to join that course in front of the admins", () => {
  it("creates a pending join request for the course behind the invite link", async () => {
    // Given a course with a live invite link
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Grace Hopper");
    formData.set("username", "grace");
    formData.set("password", "secret1234");

    // When a prospective student registers through the link
    const result = await joinSignupAction(null, formData);
    expect(result.success).toBe(true);

    // Then a pending request to join that course is waiting for admins
    const student = await services.schoolDirectory.findByUsername("grace");
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      student?.id ?? "",
    );
    expect(pending).not.toBeNull();
    expect(pending?.status).toBe(JoinRequestStatus.Pending);
  });

  it("puts the request in the queue of the invite course's school, not the default school's", async () => {
    // Given a live invite link for a course in another school
    const school = await addTestSchool("School B");
    const schoolServices = getTestServices(school.id);
    const course = await schoolServices.courseService.createCourse({
      title: "Geometry",
      description: "",
      createdBy: "admin-b",
    });
    const token = await schoolServices.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Katherine Johnson");
    formData.set("username", "katherine");
    formData.set("password", "secret1234");

    // When a prospective student registers through the link
    const result = await joinSignupAction(null, formData);
    expect(result.success).toBe(true);

    // Then the request waits only in that school's queue
    // limit 0 is Mongo's "no limit": read the whole queue, not one page
    const wholeQueue = { skip: 0, limit: 0 };
    const schoolQueue =
      await schoolServices.courseJoinRequestService.listByStatus(
        JoinRequestStatus.Pending,
        wholeQueue,
      );
    expect(schoolQueue.items.map((request) => request.courseId)).toEqual([
      course.id,
    ]);
    const defaultQueue =
      await getTestServices().courseJoinRequestService.listByStatus(
        JoinRequestStatus.Pending,
        wholeQueue,
      );
    expect(defaultQueue.total).toBe(0);
  });
});

/**
 * Feature: a prospective student is stopped from taking a username somebody
 * else already uses
 * As the school
 * I want a duplicate username self-signup blocked, not linked or renamed
 * So that one person's grades and enrollments never split across two records
 */
describe("Feature: a prospective student is stopped from taking a username somebody else already uses", () => {
  it("blocks a self-signup whose username already belongs to another student, and offers both sign-in and a new username", async () => {
    // Given a student already exists with username "alice"
    const services = getTestServices();
    await services.studentService.createStudentDocument({
      authUserId: "existing-auth-id",
      username: "alice",
      name: "Alice Existing",
      createdBy: "admin-1",
    });

    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Someone Else");
    formData.set("username", "alice");
    formData.set("password", "secret1234");

    // When someone tries to self-register with that same username
    const result = await joinSignupAction(null, formData);

    // Then registration is blocked, offering both a returning user's sign-in
    // and a stranger's next pick, since usernames are global
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "That username is already taken. If it's yours, sign in instead; otherwise choose another.",
    );

    // And no duplicate student or join request was created
    const all = await services.studentService.listStudents();
    expect(all).toHaveLength(1);
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });

  it("blocks a self-signup whose username differs only in case from an existing student's username", async () => {
    // Given a student already exists with username "alice"
    const services = getTestServices();
    await services.studentService.createStudentDocument({
      authUserId: "existing-auth-id",
      username: "alice",
      name: "Alice Existing",
      createdBy: "admin-1",
    });

    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Someone Else");
    formData.set("username", "Alice");
    formData.set("password", "secret1234");

    // When someone tries to self-register with a differently-cased username
    const result = await joinSignupAction(null, formData);

    // Then registration is blocked with the same message — never
    // better-auth's raw "user already exists" error, which would leak the
    // internal synthetic-email scheme to a stranger
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "That username is already taken. If it's yours, sign in instead; otherwise choose another.",
    );

    // And no second student and no join request were created
    const all = await services.studentService.listStudents();
    expect(all).toHaveLength(1);
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });

  it("blocks a self-signup whose username is already held by another school's student", async () => {
    // Given a student in another school already holds "alice"
    const school = await addTestSchool("School B");
    await getTestServices(school.id).studentService.createStudentDocument({
      authUserId: "existing-auth-id-b",
      username: "alice",
      name: "Alice Existing",
      createdBy: "admin-b",
    });

    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Someone Else");
    formData.set("username", "alice");
    formData.set("password", "secret1234");

    // When someone tries to self-register with that same username
    const result = await joinSignupAction(null, formData);

    // Then registration is blocked with the message covering both a
    // returning user and a genuine stranger, since usernames are global
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "That username is already taken. If it's yours, sign in instead; otherwise choose another.",
    );

    // And only the original "alice" exists in any school, with no join request
    expect(
      await db
        .collection<StudentDocument>("student")
        .countDocuments({ username: "alice" }),
    ).toBe(1);
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });
});

describe("Feature: self-signup refuses a password made only of spaces", () => {
  it("blocks account creation and names the password in the refusal message", async () => {
    // Given a course with a live invite link
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Someone");
    formData.set("username", "someone");
    // 8 spaces — passes the 8-character minimum, blank once trimmed
    formData.set("password", "        ");

    // When they submit the self-signup form
    const result = await joinSignupAction(null, formData);

    // Then registration is refused, naming the password
    expect(result.success).toBe(false);
    expect(result.message).toBe("Password cannot be only spaces");

    // And no account or join request was created
    const all = await services.studentService.listStudents();
    expect(all).toHaveLength(0);
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });
});

/**
 * Feature: a Google signup whose derived username needed a choice can finish
 * joining with a username they pick themselves
 * As a prospective student whose Google email derived a taken or unusable
 * username
 * I want to submit my own username and still join the course
 * So that I am never stranded holding a Google session with no way forward (D49)
 */
describe("Feature: a Google signup whose derived username needed a choice can finish joining with a username they pick themselves", () => {
  it("creates exactly one student bound to the SAME authUserId and one pending join request", async () => {
    // Given a course with a live invite link, and a caller already holding a
    // valid (but unclassified) Google session
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "google-auth-id-123",
      email: "collision.candidate@gmail.com",
      name: "Collision Candidate",
    });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "my-own-choice");

    // When they submit a freely-chosen username
    const result = await googleUsernameSignupAction(null, formData);

    // Then exactly one student is created, bound to the SAME authUserId —
    // never a new auth user, since one already exists for this Google session
    expect(result.success).toBe(true);
    const students = await services.studentService.listStudents();
    expect(students).toHaveLength(1);
    const studentDoc = await db
      .collection("student")
      .findOne({ username: "my-own-choice" });
    expect(studentDoc?.authUserId).toBe("google-auth-id-123");

    // And exactly one pending request is filed against the course
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      studentDoc?.id ?? "",
    );
    expect(pending).not.toBeNull();
  });

  it("refuses a chosen username already held by another school's student, and creates no account", async () => {
    await ensureIndexes(db);
    // Given a student in another school already holds "taken-name"
    const school = await addTestSchool("School B");
    await getTestServices(school.id).studentService.createStudentDocument({
      authUserId: "existing-auth-id-b",
      username: "taken-name",
      name: "Taken Name",
      createdBy: "admin-b",
    });

    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "google-auth-id-cross-school",
      email: "cross.school@gmail.com",
      name: "Cross School",
    });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "taken-name");

    // When they submit the already-taken username
    const result = await googleUsernameSignupAction(null, formData);

    // Then it is a plain naming conflict, never the identity-collision
    // wording — this is a brand-new Google signup with no other method
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "That username is already taken. Please choose another.",
    );
    // And no profile was created for this Google account in any school
    expect(
      await db
        .collection<StudentDocument>("student")
        .countDocuments({ authUserId: "google-auth-id-cross-school" }),
    ).toBe(0);
  });
});

/**
 * Feature: a Google signup lands in the invite course's own school, not the
 * caller's default school
 * As a prospective student joining a school other than the harness default
 * I want googleUsernameSignupAction to create my profile in THAT school
 * So that a school admin sees me under their own roster, never another
 * school's
 */
describe("Feature: googleUsernameSignupAction lands the new student in the invite course's own school", () => {
  it("creates the student in the invite's school, not the default school", async () => {
    // Given a live invite link for a course in another school
    const school = await addTestSchool("School B");
    const schoolServices = getTestServices(school.id);
    const course = await schoolServices.courseService.createCourse({
      title: "Geometry",
      description: "",
      createdBy: "admin-b",
    });
    const token = await schoolServices.courseService.getOrCreateInviteToken(
      course.id,
    );
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "school-b-google-auth-id",
      email: "school.b.pick@gmail.com",
      name: "School B Pick",
    });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "school-b-pick");

    // When they finish signup by picking their own username
    const result = await googleUsernameSignupAction(null, formData);

    // Then the student and their join request land in the invite's school,
    // not the default
    expect(result.success).toBe(true);
    const schoolBStudents = await schoolServices.studentService.listStudents();
    expect(schoolBStudents.map((student) => student.username)).toEqual([
      "school-b-pick",
    ]);
    expect(await getTestServices().studentService.listStudents()).toHaveLength(
      0,
    );
    const schoolBQueue =
      await schoolServices.courseJoinRequestService.listByStatus(
        JoinRequestStatus.Pending,
        { skip: 0, limit: 50 },
      );
    expect(schoolBQueue.items.map((request) => request.studentId)).toEqual([
      schoolBStudents[0].id,
    ]);
  });

  it("refuses a second sign-up for the same sign-in account, even under a different username, and keeps exactly one profile", async () => {
    // Given the unique sign-in-account index, and a first tab that already
    // finished signing up
    await ensureIndexes(db);
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    // Both tabs resolved the identity before either write landed, so each
    // still sees a caller with no profile yet
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "two-tab-google-auth-id",
      email: "two.tabs@gmail.com",
      name: "Two Tabs",
    });
    const firstForm = new FormData();
    firstForm.set("token", token);
    firstForm.set("username", "first-tab-pick");
    expect((await googleUsernameSignupAction(null, firstForm)).success).toBe(
      true,
    );

    // When the second tab submits a different username for the same account
    const secondForm = new FormData();
    secondForm.set("token", token);
    secondForm.set("username", "second-tab-pick");
    const result = await googleUsernameSignupAction(null, secondForm);

    // Then the database refuses it, and one profile remains
    expect(result).toEqual({
      success: false,
      message: "This account already has a student profile",
    });
    expect(
      await db
        .collection<StudentDocument>("student")
        .countDocuments({ authUserId: "two-tab-google-auth-id" }),
    ).toBe(1);
  });
});

/**
 * Feature: an existing student with no school yet is never provisioned a
 * second time through the Google invite flow
 * As the LMS system
 * I want a school-less student's Google identity to resolve to nothing
 * So that finishing the "pick a username" form can never create a second
 * student document for the same sign-in account
 */
describe("Feature: an existing student with no school yet is never provisioned a second time through the Google invite flow", () => {
  it("refuses googleUsernameSignupAction and creates no second student document for a school-less existing student", async () => {
    // Given a course with a live invite link, and a student record that
    // already exists for this sign-in account but has no school yet (left
    // behind by an interrupted backfill, for example). This row drives a
    // REAL signed-in cookie through the real AuthService.resolveUnclassifiedIdentity
    // — the fix under test lives there, so a spy would test nothing.
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const authService = authHolder.authService as AuthService;
    const { user } = await authService.auth.api.signUpEmail({
      body: {
        email: "orphan.google@example.com",
        password: "password-123",
        name: "Orphan Google",
      },
    });
    await db.collection("student").insertOne({
      id: crypto.randomUUID(),
      authUserId: user.id,
      username: "orphan-google",
      name: "Orphan Google",
      createdAt: new Date(),
      createdBy: "backfill",
      updatedAt: null,
      updatedBy: null,
      schoolId: null,
    });
    const { headers: signInHeaders } = await authService.auth.api.signInEmail({
      body: { email: "orphan.google@example.com", password: "password-123" },
      returnHeaders: true,
    });
    const cookie = signInHeaders
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ cookie }));

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "picked-by-orphan");

    // When they submit a freely-chosen username, as if provisioning had
    // handed them the NeedsUsername outcome
    const result = await googleUsernameSignupAction(null, formData);

    // Then the action refuses, and no second document exists for this
    // authUserId — only the one already seeded above
    expect(result).toEqual({
      success: false,
      message: "Your Google sign-in has expired. Please sign in again.",
    });
    const studentDocs = await db
      .collection("student")
      .find({ authUserId: user.id })
      .toArray();
    expect(studentDocs).toHaveLength(1);
  });
});

/**
 * Feature: an invite into a course with no school yet never works
 * As the LMS system
 * I want every join action to refuse a course that hasn't been assigned a
 * school, the same way it refuses a dead or revoked link
 * So that a course still waiting on the operator's backfill can never be
 * joined behind the scenes
 */
describe("Feature: an invite into a course with no school yet never works", () => {
  it("refuses joinSignupAction and creates no account", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "School-less Course",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    await db
      .collection("course")
      .updateOne({ id: course.id }, { $set: { schoolId: null } });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Late Joiner");
    formData.set("username", "late-joiner");
    formData.set("password", "secret1234");

    const result = await joinSignupAction(null, formData);

    expect(result).toEqual({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });
    // Counted raw: a leaked student would carry no school, so no list shows it
    expect(
      await db.collection<StudentDocument>("student").countDocuments({}),
    ).toBe(0);
  });

  it("refuses googleUsernameSignupAction and creates no account", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "School-less Course",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    await db
      .collection("course")
      .updateOne({ id: course.id }, { $set: { schoolId: null } });
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "google-auth-id-999",
      email: "late.joiner@gmail.com",
      name: "Late Joiner",
    });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "late-joiner");

    const result = await googleUsernameSignupAction(null, formData);

    expect(result).toEqual({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });
    expect(
      await db.collection<StudentDocument>("student").countDocuments({}),
    ).toBe(0);
  });

  it("refuses requestToJoinAction from a signed-in student and writes no request", async () => {
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "School-less Course",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    await db
      .collection("course")
      .updateOne({ id: course.id }, { $set: { schoolId: null } });
    const student = await (
      authHolder.authService as AuthService
    ).registerStudent({
      name: "Returning Student",
      username: "returning-student-2",
      password: "correct-horse-1",
      createdBy: "self-signup",
      schoolId: TEST_SCHOOL_ID,
    });
    vi.spyOn(
      authHolder.authService as AuthService,
      "requireStudentSession",
    ).mockResolvedValue(
      new StudentSession({
        userId: "auth-user-2",
        username: student.username,
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const formData = new FormData();
    formData.set("token", token);

    const result = await requestToJoinAction(null, formData);

    expect(result).toEqual({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
    });
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });
});

/**
 * Feature: a join refused because the invite died mid-form tells the form
 * so, letting it offer the invalid-invite card's recovery links
 */
describe("Feature: a join refused because the invite was switched off mid-form is flagged as a dead invite", () => {
  it("flags a Google-username submit whose invite was switched off after the page loaded, and creates nothing", async () => {
    // Given a live invite that is switched off while the form is open, and a
    // caller still holding a valid Google session
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    await services.courseService.disableInviteToken(course.id);
    vi.spyOn(
      authHolder.authService as AuthService,
      "resolveUnclassifiedIdentity",
    ).mockResolvedValue({
      authUserId: "google-auth-id-123",
      email: "late.joiner@gmail.com",
      name: "Late Joiner",
    });

    const formData = new FormData();
    formData.set("token", token);
    formData.set("username", "late-joiner");

    // When they submit their username
    const result = await googleUsernameSignupAction(null, formData);

    // Then the refusal is flagged as a dead invite, and no student exists
    expect(result).toEqual({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });
    expect(await services.studentService.listStudents()).toHaveLength(0);
  });

  it("flags a self-signup whose invite was switched off after the page loaded, and creates nothing", async () => {
    // Given a live invite that is switched off while the form is open
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    await services.courseService.disableInviteToken(course.id);

    const formData = new FormData();
    formData.set("token", token);
    formData.set("name", "Late Joiner");
    formData.set("username", "late-joiner");
    formData.set("password", "secret1234");

    // When they submit the self-signup form
    const result = await joinSignupAction(null, formData);

    // Then the refusal is flagged as a dead invite, and no account exists
    expect(result).toEqual({
      success: false,
      message:
        "This join link is no longer valid. Ask whoever shared it with you for a new one.",
      invalidInvite: true,
    });
    expect(await services.studentService.listStudents()).toHaveLength(0);
  });
});

/**
 * Feature: a student who already has an account can open the invite link and
 * ask to join without registering again
 * As an existing student (e.g. one whose self-registration crashed between
 * the account write and the join-request write — D47)
 * I want a signed-in path to request to join
 * So that I am never stuck holding a working account with no way to ask in
 */
describe("Feature: a student who already has an account can open the invite link and ask to join without registering again", () => {
  it("files a pending request for the SIGNED-IN student's existing account, without creating a second one", async () => {
    // Given a course with a live join link, and an existing student account
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    const student = await (
      authHolder.authService as AuthService
    ).registerStudent({
      name: "Returning Student",
      username: "returning-student",
      password: "correct-horse-1",
      createdBy: "self-signup",
      schoolId: TEST_SCHOOL_ID,
    });

    // And they are signed in as that student — the guard resolves whoever
    // holds the session cookie, never a client-supplied id (D41's rule
    // applied to identity, not just courseId)
    vi.spyOn(
      authHolder.authService as AuthService,
      "requireStudentSession",
    ).mockResolvedValue(
      new StudentSession({
        userId: "auth-user-1",
        username: student.username,
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const formData = new FormData();
    formData.set("token", token);

    // When they submit the request-to-join action
    const result = await requestToJoinAction(null, formData);

    // Then a pending request exists for their EXISTING student id
    expect(result.success).toBe(true);
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      student.id,
    );
    expect(pending).not.toBeNull();

    // And no second account was created
    const students = await services.studentService.listStudents();
    expect(students).toHaveLength(1);
  });
});

/**
 * Feature: only a signed-in student can request to join a course
 * As the school
 * I want a caller with no session (or one that isn't a student's) refused
 * before any course or join-request lookup happens
 * So that the request-to-join action can never be driven by an anonymous caller
 */
describe("Feature: only a signed-in student can request to join a course", () => {
  it("refuses an unauthenticated caller and writes no join request", async () => {
    // Given a course with a live join link, and no signed-in session at all
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );

    const formData = new FormData();
    formData.set("token", token);

    // When an unauthenticated caller submits the request-to-join action
    const result = await requestToJoinAction(null, formData);

    // Then they are refused by the auth guard, never reaching the course lookup
    expect(result.success).toBe(false);
    expect(result.message).toBe("Unauthorized: student access required");

    // And no join request row was written for this course
    expect(
      await db
        .collection("course_join_request")
        .countDocuments({ courseId: course.id }),
    ).toBe(0);
  });
});

/**
 * Feature: a student who is already in the course, or already waiting on a
 * request, is told so instead of queueing a duplicate
 * As a signed-in student who is already enrolled, or already has a pending
 * request, for the course behind this invite link
 * I want to be told my existing status
 * So that the admin queue never fills with requests from people who are
 * already members or already waiting
 */
describe("Feature: a student who is already in the course, or already waiting on a request, is told so instead of queueing a duplicate", () => {
  it("tells an already-enrolled student they're already in the course, and files no request", async () => {
    // Given a course the signed-in student is ALREADY enrolled in
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    const student = await (
      authHolder.authService as AuthService
    ).registerStudent({
      name: "Enrolled Student",
      username: "enrolled-student",
      password: "correct-horse-1",
      createdBy: "self-signup",
      schoolId: TEST_SCHOOL_ID,
    });
    await services.enrollmentService.enrollStudent(
      course.id,
      student.id,
      "admin-1",
    );
    vi.spyOn(
      authHolder.authService as AuthService,
      "requireStudentSession",
    ).mockResolvedValue(
      new StudentSession({
        userId: "auth-user-1",
        username: student.username,
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const formData = new FormData();
    formData.set("token", token);

    // When they submit the request-to-join action anyway
    const result = await requestToJoinAction(null, formData);

    // Then they're told they're already enrolled, and no request is filed
    expect(result.message).toBe(
      `You're already enrolled in "Intro to Algorithms".`,
    );
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      student.id,
    );
    expect(pending).toBeNull();
  });
});

/**
 * Feature: a signed-in student can never ask to join a course in another
 * school
 * As a student who already belongs to one school
 * I want requestToJoinAction to refuse a DIFFERENT school's invite link
 * So that a student can never end up enrolled outside their own school
 */
describe("Feature: a signed-in student can never ask to join a course in another school", () => {
  it("refuses requestToJoinAction for a course in a DIFFERENT school than the student's own, and writes no request", async () => {
    // Given a live invite link for a course in another school
    const school = await addTestSchool("School B");
    const schoolServices = getTestServices(school.id);
    const course = await schoolServices.courseService.createCourse({
      title: "Geometry",
      description: "",
      createdBy: "admin-b",
    });
    const token = await schoolServices.courseService.getOrCreateInviteToken(
      course.id,
    );

    // And a signed-in student who belongs to the DEFAULT school
    const student = await (
      authHolder.authService as AuthService
    ).registerStudent({
      name: "Own School Student",
      username: "own-school-student",
      password: "correct-horse-1",
      createdBy: "self-signup",
      schoolId: TEST_SCHOOL_ID,
    });
    vi.spyOn(
      authHolder.authService as AuthService,
      "requireStudentSession",
    ).mockResolvedValue(
      new StudentSession({
        userId: "auth-user-1",
        username: student.username,
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const formData = new FormData();
    formData.set("token", token);

    // When they submit the request-to-join action for the OTHER school's course
    const result = await requestToJoinAction(null, formData);

    // Then they are refused with the cross-school message, and no request
    // is filed in any school
    expect(result).toEqual({
      success: false,
      message:
        "This join link is for a course in another school. You can only join courses in your own school.",
    });
    expect(
      await db
        .collection<CourseJoinRequestDocument>("course_join_request")
        .countDocuments({}),
    ).toBe(0);
  });
});

describe("Feature: a student who already has a pending request is told so, and no duplicate is queued", () => {
  it("tells a student with a pending request it's already waiting, and creates no second request", async () => {
    // Given a course the signed-in student has ALREADY requested to join
    const services = getTestServices();
    const course = await services.courseService.createCourse({
      title: "Intro to Algorithms",
      description: "",
      createdBy: "admin-1",
    });
    const token = await services.courseService.getOrCreateInviteToken(
      course.id,
    );
    const student = await (
      authHolder.authService as AuthService
    ).registerStudent({
      name: "Waiting Student",
      username: "waiting-student",
      password: "correct-horse-1",
      createdBy: "self-signup",
      schoolId: TEST_SCHOOL_ID,
    });
    const firstRequest = await services.courseJoinRequestService.createRequest({
      courseId: course.id,
      studentId: student.id,
    });
    vi.spyOn(
      authHolder.authService as AuthService,
      "requireStudentSession",
    ).mockResolvedValue(
      new StudentSession({
        userId: "auth-user-1",
        username: student.username,
        studentId: student.id,
        schoolId: TEST_SCHOOL_ID,
      }),
    );

    const formData = new FormData();
    formData.set("token", token);

    // When they submit the request-to-join action again
    const result = await requestToJoinAction(null, formData);

    // Then they're told it's already waiting, and no second row is created
    expect(result.message).toBe(
      `Your request to join "Intro to Algorithms" is already waiting for admin approval.`,
    );
    const allRequestsForStudent = await db
      .collection("course_join_request")
      .find({ courseId: course.id, studentId: student.id })
      .toArray();
    expect(allRequestsForStudent).toHaveLength(1);
    expect(allRequestsForStudent[0].id).toBe(firstRequest.id);
  });
});
