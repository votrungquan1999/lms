import type { Db } from "mongodb";
import { type AuthService, createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { SchoolService } from "src/lib/school-service";
import { StudentService } from "src/lib/student-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

/**
 * Feature: only the platform owner passes the owner check
 * As the LMS system
 * I want requireOwnerSession to demand BOTH a recorded admin AND an
 * ADMIN_EMAILS address
 * So that only the platform owner can create schools or grant school
 * admins
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

function testConfig(adminEmails: string[]): AppConfig {
  return {
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
    adminEmails,
    trustedOrigins: [],
    allowPublicSignUp: false,
  };
}

/** Builds a real AuthService against the test db, with real dependencies. */
function realAuthService(db: Db, adminEmails: string[]): AuthService {
  return createAuthService(db, testConfig(adminEmails), {
    studentService: new StudentService(db),
    schoolService: new SchoolService(db),
  });
}

describe("Feature: only the platform owner passes the owner check", () => {
  dbIt(
    "grants a session to a recorded admin whose email is in ADMIN_EMAILS",
    async ({ db }) => {
      const authService = realAuthService(db, ["owner@example.com"]);
      const { user } = await authService.auth.api.signUpEmail({
        body: {
          email: "owner@example.com",
          password: "password-123",
          name: "Owner",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: user.email }, { $set: { role: "admin" } });

      const headers = await signedInHeaders(
        authService,
        "owner@example.com",
        "password-123",
      );

      const session = await authService.requireOwnerSession(headers);
      expect(session.email).toBe("owner@example.com");
    },
  );

  dbIt(
    "refuses a recorded admin whose email is not in ADMIN_EMAILS",
    async ({ db }) => {
      const authService = realAuthService(db, ["owner@example.com"]);
      const { user } = await authService.auth.api.signUpEmail({
        body: {
          email: "unlisted-admin@example.com",
          password: "password-123",
          name: "Unlisted Admin",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: user.email }, { $set: { role: "admin" } });

      const headers = await signedInHeaders(
        authService,
        "unlisted-admin@example.com",
        "password-123",
      );

      // The owner-specific message proves sign-in worked and the email check refused.
      await expect(authService.requireOwnerSession(headers)).rejects.toThrow(
        "owner access required",
      );
    },
  );

  dbIt(
    "refuses an ADMIN_EMAILS address whose recorded role is student",
    async ({ db }) => {
      const authService = realAuthService(db, ["owner@example.com"]);
      await authService.auth.api.signUpEmail({
        body: {
          email: "owner@example.com",
          password: "password-123",
          name: "Owner",
        },
      });
      // No role set — defaults to Student, even though the email is
      // on the ADMIN_EMAILS list.

      const headers = await signedInHeaders(
        authService,
        "owner@example.com",
        "password-123",
      );

      await expect(authService.requireOwnerSession(headers)).rejects.toThrow();
    },
  );
});

/**
 * Feature: a teacher who is an admin of one school works in that school
 * As a school admin (teacher) who belongs to exactly one school
 * I want my session to already carry my school as soon as I sign in
 * So that every page and action I reach has a school to act in
 */
describe("Feature: a teacher who is an admin of one school works in that school", () => {
  dbIt(
    "resolves session.school to the admin's one school, by the session's own user id",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const school = await schoolService.createSchool({
        name: "Acme School",
        slug: "acme",
        createdBy: "owner-1",
      });

      const { user } = await authService.auth.api.signUpEmail({
        body: {
          email: "teacher@example.com",
          password: "password-123",
          name: "Teacher",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: user.email }, { $set: { role: "admin" } });
      // Proves the stored id format resolves: the membership is written
      // with the session's OWN user id, the same value classify() sees.
      await schoolService.addMembership(school.id, user.id, "owner-1");

      const headers = await signedInHeaders(
        authService,
        "teacher@example.com",
        "password-123",
      );
      const session = await authService.getSession(headers);

      expect(session?.role).toBe("admin");
      expect(
        session && "school" in session ? session.school : undefined,
      ).toEqual({ id: school.id, name: school.name });
    },
  );
});
