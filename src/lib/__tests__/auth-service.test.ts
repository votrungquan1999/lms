import {
  type AuthService,
  createAuthService,
  LoginEntryState,
} from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { Role } from "src/lib/session";
import { StudentService } from "src/lib/student-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

/**
 * Feature: Auth Service
 * As the LMS system
 * I want an auth service that separates auth from domain data
 * So that Better Auth handles only credentials/sessions
 * and our student collection owns all business logic data
 */

const dbIt = withTestDb(it);

/**
 * Signs in through the real Better Auth instance and turns the response's
 * Set-Cookie header into a Cookie header usable by AuthService.getSession.
 */
async function signedInHeaders(
  authService: AuthService,
  email: string,
  password: string,
): Promise<Headers> {
  const { headers: signInHeaders } = await authService.auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = signInHeaders
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

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

describe("Feature: Auth Service", () => {
  dbIt("admin can create a student account", async ({ db }) => {
    const studentService = new StudentService(db);
    const authService = createAuthService(db, testConfig, studentService);

    const student = await authService.registerStudent({
      name: "Alice",
      username: "alice",
      password: "student-pass-123",
      createdBy: "admin-test",
    });

    expect(student.username).toBe("alice");
    expect(student.name).toBe("Alice");
    expect(student.id).toBeDefined();
  });

  dbIt(
    "creating a student with a duplicate username throws an error",
    async ({ db }) => {
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);

      await authService.registerStudent({
        name: "Alice",
        username: "alice",
        password: "student-pass-123",
        createdBy: "admin-test",
      });

      await expect(
        authService.registerStudent({
          name: "Alice Duplicate",
          username: "alice",
          password: "another-pass-456",
          createdBy: "admin-test",
        }),
      ).rejects.toThrow("Username already exists");
    },
  );

  dbIt(
    "student can sign in with username and password created by admin",
    async ({ db }) => {
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);

      await authService.registerStudent({
        name: "Bob",
        username: "bob",
        password: "bob-pass-123",
        createdBy: "admin-test",
      });

      const session = await authService.signInStudent({
        username: "bob",
        password: "bob-pass-123",
      });

      expect(session.user).toBeDefined();
      expect(session.token).toBeDefined();
    },
  );

  dbIt("sign-in with wrong password throws an error", async ({ db }) => {
    const studentService = new StudentService(db);
    const authService = createAuthService(db, testConfig, studentService);

    await authService.registerStudent({
      name: "Carol",
      username: "carol",
      password: "carol-pass-123",
      createdBy: "admin-test",
    });

    await expect(
      authService.signInStudent({
        username: "carol",
        password: "wrong-password",
      }),
    ).rejects.toThrow();
  });

  dbIt("sign-in with non-existent username throws an error", async ({ db }) => {
    const studentService = new StudentService(db);
    const authService = createAuthService(db, testConfig, studentService);

    await expect(
      authService.signInStudent({
        username: "nobody",
        password: "some-password",
      }),
    ).rejects.toThrow("Invalid username or password");
  });
});

describe("Feature: admin access is decided by recorded role, not email", () => {
  dbIt(
    "a listed email with no recorded admin role is not admin, and a recorded admin role is admin regardless of the email list",
    async ({ db }) => {
      const studentService = new StudentService(db);
      const config: AppConfig = {
        ...testConfig,
        adminEmails: ["listed@example.com"],
      };
      const authService = createAuthService(db, config, studentService);

      // Ann's email is on the admin list, but nobody recorded her as an admin
      await authService.auth.api.signUpEmail({
        body: {
          email: "listed@example.com",
          password: "password-123",
          name: "Ann",
        },
      });
      const annSession = await authService.getSession(
        await signedInHeaders(
          authService,
          "listed@example.com",
          "password-123",
        ),
      );

      // Bob's email is off the admin list, but the school recorded him as an admin
      await authService.auth.api.signUpEmail({
        body: {
          email: "unlisted@example.com",
          password: "password-123",
          name: "Bob",
        },
      });
      await db
        .collection("user")
        .updateOne(
          { email: "unlisted@example.com" },
          { $set: { role: "admin" } },
        );
      const bobSession = await authService.getSession(
        await signedInHeaders(
          authService,
          "unlisted@example.com",
          "password-123",
        ),
      );

      expect(annSession?.role).not.toBe(Role.Admin);
      expect(bobSession?.role).toBe(Role.Admin);
    },
  );
});

describe("Feature: registerStudent leaves no orphaned account on failure", () => {
  dbIt(
    "removes the better-auth user when the student-document write fails after signup",
    async ({ db }) => {
      // Signup must succeed for an orphan to be possible — force the failure
      // to land AFTER it, in the write this rollback is meant to undo.
      class FailingStudentService extends StudentService {
        async createStudentDocument(): Promise<never> {
          throw new Error("simulated student-document write failure");
        }
      }
      const studentService = new FailingStudentService(db);
      const authService = createAuthService(db, testConfig, studentService);

      await expect(
        authService.registerStudent({
          name: "Dave",
          username: "dave",
          password: "dave-pass-123",
          createdBy: "admin-test",
        }),
      ).rejects.toThrow("simulated student-document write failure");

      const orphanedUser = await db
        .collection("user")
        .findOne({ email: "dave@lms.internal" });

      expect(orphanedUser).toBeNull();

      // signUpEmail also writes an `account` row (password hash) and a
      // `session` row — the rollback must undo those too, not just `user`.
      const orphanedAccountsCount = await db
        .collection("account")
        .countDocuments({ providerId: "credential" });
      const orphanedSessionsCount = await db
        .collection("session")
        .countDocuments({});

      expect(orphanedAccountsCount).toBe(0);
      expect(orphanedSessionsCount).toBe(0);
    },
  );
});

describe("Feature: resolving what a login page should show for the current caller", () => {
  dbIt(
    "classifies a signed-out visitor, a recorded admin, a recorded student, and an authenticated-but-unclassified caller",
    async ({ db }) => {
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);

      // Genuinely signed out — no cookie at all
      const signedOutState = await authService.resolveLoginEntryState(
        new Headers(),
      );
      expect(signedOutState).toBe(LoginEntryState.SignedOut);

      // Recorded admin
      await authService.auth.api.signUpEmail({
        body: {
          email: "admin2@example.com",
          password: "password-123",
          name: "Admin",
        },
      });
      await db
        .collection("user")
        .updateOne(
          { email: "admin2@example.com" },
          { $set: { role: "admin" } },
        );
      const adminState = await authService.resolveLoginEntryState(
        await signedInHeaders(
          authService,
          "admin2@example.com",
          "password-123",
        ),
      );
      expect(adminState).toBe(LoginEntryState.Admin);

      // Recorded student
      await authService.registerStudent({
        name: "Eve",
        username: "eve",
        password: "eve-pass-123",
        createdBy: "admin-test",
      });
      const studentState = await authService.resolveLoginEntryState(
        await signedInHeaders(authService, "eve@lms.internal", "eve-pass-123"),
      );
      expect(studentState).toBe(LoginEntryState.Student);

      // Authenticated but unclassified — real cookie, no role, no student doc
      await authService.auth.api.signUpEmail({
        body: {
          email: "ghost@example.com",
          password: "password-123",
          name: "Ghost",
        },
      });
      const unclassifiedState = await authService.resolveLoginEntryState(
        await signedInHeaders(authService, "ghost@example.com", "password-123"),
      );
      expect(unclassifiedState).toBe(LoginEntryState.Unclassified);
    },
  );
});

describe("Feature: an administrator signing in with Google is never turned into a student", () => {
  dbIt(
    "resolves a Google identity to provision only for an authenticated-but-unclassified caller, never for a signed-out visitor, a recorded admin, or a recorded student",
    async ({ db }) => {
      const studentService = new StudentService(db);
      const authService = createAuthService(db, testConfig, studentService);

      // A genuinely signed-out visitor has no session to read an identity from
      const signedOutIdentity = await authService.resolveUnclassifiedIdentity(
        new Headers(),
      );
      expect(signedOutIdentity).toBeNull();

      // A recorded admin must never be re-provisioned as a student, no
      // matter how they signed in
      await authService.auth.api.signUpEmail({
        body: {
          email: "admin3@example.com",
          password: "password-123",
          name: "Admin",
        },
      });
      await db
        .collection("user")
        .updateOne(
          { email: "admin3@example.com" },
          { $set: { role: "admin" } },
        );
      const adminIdentity = await authService.resolveUnclassifiedIdentity(
        await signedInHeaders(
          authService,
          "admin3@example.com",
          "password-123",
        ),
      );
      expect(adminIdentity).toBeNull();

      // A recorded student must never be provisioned a second time either
      await authService.registerStudent({
        name: "Fay",
        username: "fay",
        password: "fay-pass-123",
        createdBy: "admin-test",
      });
      const studentIdentity = await authService.resolveUnclassifiedIdentity(
        await signedInHeaders(authService, "fay@lms.internal", "fay-pass-123"),
      );
      expect(studentIdentity).toBeNull();

      // Only an authenticated-but-unclassified caller — a real cookie, no
      // recorded role, no student document — gets their identity back
      const freshSignup = await authService.auth.api.signUpEmail({
        body: {
          email: "fresh.signup@example.com",
          password: "password-123",
          name: "Fresh Signup",
        },
      });
      const unclassifiedIdentity =
        await authService.resolveUnclassifiedIdentity(
          await signedInHeaders(
            authService,
            "fresh.signup@example.com",
            "password-123",
          ),
        );
      // Asserting the REAL id (not expect.any(String)) matters here: this
      // test's whole purpose is that identities are never confused across
      // roles — a wrong id (e.g. leaked from the admin or student signed up
      // earlier in this same test) would pass a loose string-shape check.
      expect(unclassifiedIdentity).toEqual({
        authUserId: freshSignup.user.id,
        email: "fresh.signup@example.com",
        name: "Fresh Signup",
      });
    },
  );
});
