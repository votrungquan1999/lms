import { createAuthService, LoginEntryState } from "src/lib/auth-service";
import { ensureIndexes } from "src/lib/database";
import { Role } from "src/lib/session";
import { StudentService } from "src/lib/student-service";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { signedInHeaders, testConfig } from "src/tests/auth-test-helpers";
import { TEST_SCHOOL_ID, withTestDb } from "src/tests/create-test-db";
import { describe, expect, it, vi } from "vitest";

/**
 * Feature: Auth Service
 * As the LMS system
 * I want an auth service that separates auth from domain data
 * So that Better Auth handles only credentials/sessions
 * and our student collection owns all business logic data
 */

const dbIt = withTestDb(it);

describe("Feature: Auth Service", () => {
  dbIt("admin can create a student account", async ({ db }) => {
    const authService = createAuthService(
      db,
      testConfig(),
      realAuthServiceDeps(db),
    );

    const student = await authService.registerStudent({
      name: "Alice",
      username: "alice",
      password: "student-pass-123",
      createdBy: "admin-test",
      schoolId: TEST_SCHOOL_ID,
    });

    expect(student.username).toBe("alice");
    expect(student.name).toBe("Alice");
    expect(student.id).toBeDefined();
  });

  dbIt(
    "creating a student with a duplicate username throws an error",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      await authService.registerStudent({
        name: "Alice",
        username: "alice",
        password: "student-pass-123",
        createdBy: "admin-test",
        schoolId: TEST_SCHOOL_ID,
      });

      await expect(
        authService.registerStudent({
          name: "Alice Duplicate",
          username: "alice",
          password: "another-pass-456",
          createdBy: "admin-test",
          schoolId: TEST_SCHOOL_ID,
        }),
      ).rejects.toThrow("Username already exists");
    },
  );

  dbIt(
    "refuses a username already held in another school even when registerStudent's own pre-check misses it",
    async ({ db }) => {
      await ensureIndexes(db);
      const deps = realAuthServiceDeps(db);
      const authService = createAuthService(db, testConfig(), deps);

      // A Google-style student in another school already holds "alice".
      await new StudentService(db, "school-b").createStudentDocument({
        authUserId: "google-auth-alice",
        username: "alice",
        name: "Alice B",
        createdBy: "google-signup",
      });

      // The pre-check misses the existing row exactly once, simulating a
      // stale read racing ahead of the write above.
      vi.spyOn(deps.schoolDirectory, "findByUsername").mockResolvedValueOnce(
        null,
      );

      await expect(
        authService.registerStudent({
          name: "Alice A",
          username: "alice",
          password: "student-pass-123",
          createdBy: "admin-test",
          schoolId: TEST_SCHOOL_ID,
        }),
      ).rejects.toThrow("Username already exists");

      expect(
        await db.collection("student").countDocuments({ username: "alice" }),
      ).toBe(1);
      // The auth user created before the clash was found is rolled back.
      expect(
        await db.collection("user").findOne({ email: "alice@lms.internal" }),
      ).toBeNull();
    },
  );

  dbIt(
    "registerStudent refuses a password made only of spaces, creating no auth user",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      // 8 spaces — long enough to pass a bare length check, but blank once
      // trimmed, so it could never be typed back in to sign in again.
      await expect(
        authService.registerStudent({
          name: "Eve",
          username: "eve",
          password: "        ",
          createdBy: "admin-test",
          schoolId: TEST_SCHOOL_ID,
        }),
      ).rejects.toThrow("Password cannot be only spaces");

      const orphanedUser = await db
        .collection("user")
        .findOne({ email: "eve@lms.internal" });
      expect(orphanedUser).toBeNull();
    },
  );

  dbIt(
    "registerStudent refuses a missing school, creating no auth user and no student",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      await expect(
        authService.registerStudent({
          name: "Zed",
          username: "zed",
          password: "zed-pass-123",
          createdBy: "admin-test",
          schoolId: "",
        }),
      ).rejects.toThrow("A school is required");

      expect(
        await db.collection("user").findOne({ email: "zed@lms.internal" }),
      ).toBeNull();
      expect(await db.collection("student").countDocuments()).toBe(0);
    },
  );

  dbIt(
    "student can sign in with username and password created by admin",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      await authService.registerStudent({
        name: "Bob",
        username: "bob",
        password: "bob-pass-123",
        createdBy: "admin-test",
        schoolId: TEST_SCHOOL_ID,
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
    const authService = createAuthService(
      db,
      testConfig(),
      realAuthServiceDeps(db),
    );

    await authService.registerStudent({
      name: "Carol",
      username: "carol",
      password: "carol-pass-123",
      createdBy: "admin-test",
      schoolId: TEST_SCHOOL_ID,
    });

    await expect(
      authService.signInStudent({
        username: "carol",
        password: "wrong-password",
      }),
    ).rejects.toThrow();
  });

  dbIt("sign-in with non-existent username throws an error", async ({ db }) => {
    const authService = createAuthService(
      db,
      testConfig(),
      realAuthServiceDeps(db),
    );

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
      const authService = createAuthService(
        db,
        testConfig(["listed@example.com"]),
        realAuthServiceDeps(db),
      );

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
      const authService = createAuthService(db, testConfig(), {
        ...realAuthServiceDeps(db),
        getStudentService: async (schoolId) =>
          new FailingStudentService(db, schoolId),
      });

      await expect(
        authService.registerStudent({
          name: "Dave",
          username: "dave",
          password: "dave-pass-123",
          createdBy: "admin-test",
          schoolId: TEST_SCHOOL_ID,
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
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

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
        schoolId: TEST_SCHOOL_ID,
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
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

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
        schoolId: TEST_SCHOOL_ID,
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
