import { type AuthService, createAuthService } from "src/lib/auth-service";
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
