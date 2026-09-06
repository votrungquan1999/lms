import type { Db } from "mongodb";
import { type AuthService, createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
import { StudentSession } from "src/lib/session";
import { StudentService } from "src/lib/student-service";
import {
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
    new StudentService(db),
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
    const student = await services.studentService.findByUsername("grace");
    const pending = await services.courseJoinRequestService.getPendingRequest(
      course.id,
      student?.id ?? "",
    );
    expect(pending).not.toBeNull();
    expect(pending?.status).toBe(JoinRequestStatus.Pending);
  });
});

/**
 * Feature: a prospective student is stopped from taking a username somebody
 * else already uses
 * As the school
 * I want a duplicate username self-signup blocked, not linked or renamed
 * So that one person's grades and enrollments never split across two records (D3)
 */
describe("Feature: a prospective student is stopped from taking a username somebody else already uses", () => {
  it("blocks a self-signup whose username already belongs to another student, and tells them to use their original sign-in method", async () => {
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

    // Then registration is blocked and they are told to use their original
    // sign-in method — never a generic "username taken, pick another"
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "This username already belongs to an account. Please sign in with your original method instead.",
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

    // Then registration is blocked with the same D3 message — never
    // better-auth's raw "user already exists" error, which would leak the
    // internal synthetic-email scheme to a stranger
    expect(result.success).toBe(false);
    expect(result.message).toBe(
      "This username already belongs to an account. Please sign in with your original method instead.",
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
