import {
  addTestSchool,
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

const requireStudentSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireStudentSession })),
}));

import { switchSchoolAction } from "../switch-school-actions";

beforeEach(async () => {
  await setupTestDb();
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

/** A student created in the first school and added to the second. */
async function seedStudentInTwoSchools() {
  const alpha = await addTestSchool("Alpha School");
  const beta = await addTestSchool("Beta School");
  const student = await getTestServices(
    alpha.id,
  ).studentService.createStudentDocument({
    authUserId: "auth-kid",
    username: "kid",
    name: "Kid",
    createdBy: "admin-1",
  });
  await getTestServices(beta.id).studentService.addToSchool(student.id);
  requireStudentSession.mockResolvedValue({
    userId: "auth-kid",
    studentId: student.id,
    schoolId: alpha.id,
  });
  return { alpha, beta };
}

/**
 * Feature: a student switches their active school
 * As a student who belongs to more than one school
 * I want to switch which school I'm working in
 * So that I never land in a school I don't belong to
 */
describe("Feature: a student switches their active school", () => {
  it("switching to one of the student's schools sets the active-school cookie and redirects to the student dashboard", async () => {
    const { beta } = await seedStudentInTwoSchools();

    await expect(switchSchoolAction(switchForm(beta.id))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mockCookieSet).toHaveBeenCalledWith(
      "lms_active_school",
      beta.id,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/student/dashboard");
  });

  it("a school the student does not belong to is refused, and the cookie is never set", async () => {
    await seedStudentInTwoSchools();
    const foreign = await addTestSchool("Foreign School");

    await expect(switchSchoolAction(switchForm(foreign.id))).rejects.toThrow(
      "You do not belong to that school",
    );

    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
