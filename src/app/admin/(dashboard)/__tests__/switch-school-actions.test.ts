import type { Db } from "mongodb";
import { ACTIVE_SCHOOL_COOKIE_NAME } from "src/lib/active-school-cookie";
import { type AuthService, createAuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";
import { isAdminSession } from "src/lib/session";
import { StudentService } from "src/lib/student-service";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());

const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ set: mockCookieSet })),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import { switchSchoolAction } from "../switch-school-actions";

let db: Db;

beforeEach(async () => {
  const setup = await setupTestDb();
  db = setup.db;
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

function switchForm(schoolId: string): FormData {
  const formData = new FormData();
  formData.set("schoolId", schoolId);
  return formData;
}

/** Raw-inserts a `user` doc and returns its hex id — `addMembership` stamps a real user. */
async function insertRawAdminUserId(rawDb: Db): Promise<string> {
  const insert = await rawDb
    .collection("user")
    .insertOne({ email: "raw-admin@example.com", role: "admin" });
  return insert.insertedId.toString();
}

function testConfig(): AppConfig {
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
    adminEmails: [],
    trustedOrigins: [],
    allowPublicSignUp: false,
  };
}

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

/**
 * Feature: a teacher switches their active school
 * As a school admin (teacher) who belongs to more than one school
 * I want to switch which school I'm working in
 * So that I can move between my schools without ever landing in one I
 * don't belong to
 */
describe("Feature: a teacher switches their active school", () => {
  it("switching to a school the admin belongs to sets the active-school cookie and redirects to the dashboard", async () => {
    const { schoolService } = getTestServices();
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
    const userId = await insertRawAdminUserId(db);
    await schoolService.addMembership(alpha.id, userId, "owner-1");
    await schoolService.addMembership(beta.id, userId, "owner-1");
    requireAdminSession.mockResolvedValue({ userId, role: "admin" });

    await expect(switchSchoolAction(switchForm(beta.id))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    // Literal attributes: the cookie must stay unreadable by page scripts
    // and unsent on cross-site posts, whatever the shared options become.
    expect(mockCookieSet).toHaveBeenCalledWith(
      "lms_active_school",
      beta.id,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("a school the admin does not belong to is refused, and the cookie is never set", async () => {
    const { schoolService } = getTestServices();
    const alpha = await schoolService.createSchool({
      name: "Alpha School",
      slug: "alpha",
      createdBy: "owner-1",
    });
    const foreignSchool = await schoolService.createSchool({
      name: "Foreign School",
      slug: "foreign",
      createdBy: "owner-1",
    });
    const userId = await insertRawAdminUserId(db);
    await schoolService.addMembership(alpha.id, userId, "owner-1");
    requireAdminSession.mockResolvedValue({ userId, role: "admin" });

    await expect(
      switchSchoolAction(switchForm(foreignSchool.id)),
    ).rejects.toThrow("You do not belong to that school");

    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("the cookie the action sets is the same value a real AuthService reads back to select the new school", async () => {
    const { schoolService } = getTestServices();
    const authService = createAuthService(db, testConfig(), {
      studentService: new StudentService(db),
      schoolService,
    });
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
    await schoolService.addMembership(alpha.id, user.id, "owner-1");
    await schoolService.addMembership(beta.id, user.id, "owner-1");
    requireAdminSession.mockResolvedValue({ userId: user.id, role: "admin" });

    await expect(switchSchoolAction(switchForm(beta.id))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    const [, cookieValue] = mockCookieSet.mock.calls[0] as [string, string];
    const signInHeaders = await signedInHeaders(
      authService,
      "teacher@example.com",
      "password-123",
    );
    const headersWithActiveSchool = new Headers({
      cookie: `${signInHeaders.get("cookie")}; ${ACTIVE_SCHOOL_COOKIE_NAME}=${cookieValue}`,
    });

    const session = await authService.getSession(headersWithActiveSchool);

    expect(session && isAdminSession(session) ? session.school : null).toEqual({
      id: beta.id,
      name: beta.name,
    });
  });
});
