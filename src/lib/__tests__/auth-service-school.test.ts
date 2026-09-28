import type { Db } from "mongodb";
import { ACTIVE_SCHOOL_COOKIE_NAME } from "src/lib/active-school-cookie";
import {
  type AuthService,
  createAuthService,
  OwnerRequiredError,
} from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { type School, SchoolService } from "src/lib/school-service";
import { isAdminSession, type Session } from "src/lib/session";
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

/** Appends the active-school cookie to an already-signed-in Cookie header. */
function withActiveSchoolCookie(headers: Headers, schoolId: string): Headers {
  const cookie = headers.get("cookie") ?? "";
  return new Headers({
    cookie: `${cookie}; ${ACTIVE_SCHOOL_COOKIE_NAME}=${schoolId}`,
  });
}

/** Narrows a session to its active school, failing loudly on the wrong role. */
function activeSchoolOf(
  session: Session | null,
): { id: string; name: string } | null {
  if (!session || !isAdminSession(session)) {
    throw new Error("expected an admin session");
  }
  return session.school;
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

/** Signs up a teacher, records the admin role, and joins each given school. */
async function createAdminInSchools(
  db: Db,
  authService: AuthService,
  schoolService: SchoolService,
  email: string,
  schools: Pick<School, "id">[],
): Promise<{ userId: string; headers: Headers }> {
  const { user } = await authService.auth.api.signUpEmail({
    body: { email, password: "password-123", name: "Teacher" },
  });
  await db.collection("user").updateOne({ email }, { $set: { role: "admin" } });
  for (const school of schools) {
    await schoolService.addMembership(school.id, user.id, "owner-1");
  }
  const headers = await signedInHeaders(authService, email, "password-123");
  return { userId: user.id, headers };
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
    "names the refused non-owner admin, so owner-only actions can log who tried",
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

      const error = await authService
        .requireOwnerSession(headers)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(OwnerRequiredError);
      expect((error as OwnerRequiredError).userId).toBe(user.id);
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

/**
 * Feature: a teacher in several schools works in the school they chose
 * As a school admin (teacher) who belongs to more than one school
 * I want my session to resolve to the school I last picked, or my first
 * school if I never picked one, and never to a school I don't belong to
 * So that I can move between schools without ever landing in the wrong one
 */
describe("Feature: a teacher in several schools works in the school they chose", () => {
  dbIt(
    "with no active-school cookie, resolves the first school by name",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta],
      );

      const session = await authService.getSession(headers);

      expect(activeSchoolOf(session)).toEqual({
        id: alpha.id,
        name: alpha.name,
      });
    },
  );

  dbIt(
    "a cookie naming a school the admin belongs to resolves that school, even when it isn't first by name",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta],
      );

      const session = await authService.getSession(
        withActiveSchoolCookie(headers, beta.id),
      );

      expect(activeSchoolOf(session)).toEqual({
        id: beta.id,
        name: beta.name,
      });
    },
  );

  dbIt(
    "a cookie naming a school the admin does not belong to falls back to the first school by name",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const gamma = await schoolService.createSchool({
        name: "Gamma School",
        slug: "gamma",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta],
      );

      const session = await authService.getSession(
        withActiveSchoolCookie(headers, gamma.id),
      );

      expect(activeSchoolOf(session)).toEqual({
        id: alpha.id,
        name: alpha.name,
      });
    },
  );

  dbIt(
    "a tampered, non-id cookie value never throws and falls back to the first school by name",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta],
      );

      const session = await authService.getSession(
        withActiveSchoolCookie(headers, "not-a-real-school-id"),
      );

      expect(activeSchoolOf(session)).toEqual({
        id: alpha.id,
        name: alpha.name,
      });
    },
  );

  dbIt(
    "a malformed percent-encoded cookie value never throws and falls back to the first school by name",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta],
      );

      const session = await authService.getSession(
        withActiveSchoolCookie(headers, "%E0%A4%A"),
      );

      expect(activeSchoolOf(session)).toEqual({
        id: alpha.id,
        name: alpha.name,
      });
    },
  );

  dbIt(
    "a membership removed after the cookie was set is never honored, falling back among the remaining schools",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const alpha = await schoolService.createSchool({
        name: "Alpha School",
        slug: "alpha",
        createdBy: "owner-1",
      });
      const beta = await schoolService.createSchool({
        name: "Beta School",
        slug: "beta",
        createdBy: "owner-1",
      });
      const gamma = await schoolService.createSchool({
        name: "Gamma School",
        slug: "gamma",
        createdBy: "owner-1",
      });
      // Three memberships, so revoking one still leaves two — the row must
      // exercise the fallback chain, not just fall into the single-school branch.
      const { userId, headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [alpha, beta, gamma],
      );
      const cookieHeaders = withActiveSchoolCookie(headers, gamma.id);
      await schoolService.removeMembership(gamma.id, userId);

      const session = await authService.getSession(cookieHeaders);

      expect(activeSchoolOf(session)).toEqual({
        id: alpha.id,
        name: alpha.name,
      });
    },
  );

  dbIt(
    "sorts the fallback by name case-insensitively — 'a school' before 'B School'",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      // Byte order puts "B" before "a", and so does creation order — only a
      // case-insensitive sort picks "a school".
      const bSchool = await schoolService.createSchool({
        name: "B School",
        slug: "b-school",
        createdBy: "owner-1",
      });
      const aSchool = await schoolService.createSchool({
        name: "a school",
        slug: "a-school",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [bSchool, aSchool],
      );

      const session = await authService.getSession(headers);

      expect(activeSchoolOf(session)).toEqual({
        id: aSchool.id,
        name: aSchool.name,
      });
    },
  );

  dbIt(
    "breaks an equal-name tie in the fallback by the lower id",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      // Fixed ids, higher one stored first: without the tie-break the stable
      // sort would keep storage order and pick the higher id.
      const higher = {
        id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
        name: "Tied School",
      };
      const lower = {
        id: "00000000-0000-4000-8000-000000000000",
        name: "Tied School",
      };
      await db.collection("school").insertMany([
        {
          ...higher,
          slug: "tied-high",
          createdAt: new Date(),
          createdBy: "owner-1",
        },
        {
          ...lower,
          slug: "tied-low",
          createdAt: new Date(),
          createdBy: "owner-1",
        },
      ]);
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [higher, lower],
      );

      const session = await authService.getSession(headers);

      expect(activeSchoolOf(session)).toEqual(lower);
    },
  );
});

/**
 * Feature: a teacher who belongs to no school can't reach any school's data
 * As the LMS system
 * I want requireAdminSession to fail closed for a staff account with no
 * school membership
 * So that no school action can ever run for someone who isn't part of any
 * school, even one that forgets to check the session's school itself
 */
describe("Feature: a teacher who belongs to no school can't reach any school's data", () => {
  dbIt(
    "requireAdminSession returns the active school for a recorded admin with a membership",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const schoolService = new SchoolService(db);
      const acme = await schoolService.createSchool({
        name: "Acme School",
        slug: "acme",
        createdBy: "owner-1",
      });
      const { headers } = await createAdminInSchools(
        db,
        authService,
        schoolService,
        "teacher@example.com",
        [acme],
      );

      const session = await authService.requireAdminSession(headers);

      expect(session.school).toEqual({ id: acme.id, name: acme.name });
    },
  );

  dbIt(
    "requireAdminSession fails closed for a recorded admin with zero memberships",
    async ({ db }) => {
      const authService = realAuthService(db, []);
      const { user } = await authService.auth.api.signUpEmail({
        body: {
          email: "lonely-admin@example.com",
          password: "password-123",
          name: "Lonely Admin",
        },
      });
      await db
        .collection("user")
        .updateOne({ email: user.email }, { $set: { role: "admin" } });

      const headers = await signedInHeaders(
        authService,
        "lonely-admin@example.com",
        "password-123",
      );

      await expect(authService.requireAdminSession(headers)).rejects.toThrow(
        "not part of any school",
      );
    },
  );

  dbIt(
    "requireOwnerSession still succeeds for the owner even with zero school memberships",
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
});
