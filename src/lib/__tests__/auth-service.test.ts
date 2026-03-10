import { createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
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
  authUrl: "http://localhost:3000",
  google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
  adminEmails: [],
};

describe("Feature: Auth Service", () => {
  dbIt(
    "admin can create a student account with the student role",
    async ({ db }) => {
      const authService = createAuthService(db, testConfig);

      const student = await authService.createStudent({
        name: "Alice",
        username: "alice",
        password: "student-pass-123",
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
      const authService = createAuthService(db, testConfig);

      await authService.createStudent({
        name: "Alice",
        username: "alice",
        password: "student-pass-123",
      });

      await expect(
        authService.createStudent({
          name: "Alice Duplicate",
          username: "alice",
          password: "another-pass-456",
        }),
      ).rejects.toThrow("Username already exists");
    },
  );

  dbIt(
    "student can sign in with username and password created by admin",
    async ({ db }) => {
      const authService = createAuthService(db, testConfig);

      await authService.createStudent({
        name: "Bob",
        username: "bob",
        password: "bob-pass-123",
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
    const authService = createAuthService(db, testConfig);

    await authService.createStudent({
      name: "Carol",
      username: "carol",
      password: "carol-pass-123",
    });

    await expect(
      authService.signInStudent({
        username: "carol",
        password: "wrong-password",
      }),
    ).rejects.toThrow();
  });

  dbIt("sign-in with non-existent username throws an error", async ({ db }) => {
    const authService = createAuthService(db, testConfig);

    await expect(
      authService.signInStudent({
        username: "nobody",
        password: "some-password",
      }),
    ).rejects.toThrow("Invalid username or password");
  });
});
