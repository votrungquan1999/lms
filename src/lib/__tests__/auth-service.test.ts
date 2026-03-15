import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
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

const testConfig: AppConfig = {
  mongodbUri: "unused-in-test",
  authSecret: "test-secret",
  authAllowedHosts: ["localhost:3000"],
  google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  adminEmails: [],
  trustedOrigins: [],
};

describe("Feature: Auth Service", () => {
  dbIt(
    "admin can create a student account with the student role",
    async ({ db }) => {
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
      expect(student.role).toBe("student");
      expect(student.id).toBeDefined();
    },
  );

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
