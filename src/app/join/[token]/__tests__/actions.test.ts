import type { Db } from "mongodb";
import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { JoinRequestStatus } from "src/lib/course-join-request-service";
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
const authHolder = vi.hoisted(() => ({ authService: null as unknown }));
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => authHolder.authService),
}));

import { joinSignupAction } from "../actions";

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
