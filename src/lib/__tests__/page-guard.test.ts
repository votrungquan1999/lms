import { EnrollmentService } from "src/lib/enrollment-service";
import { PageGuard } from "src/lib/page-guard";
import { withTestDb } from "src/tests/create-test-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for PageGuard.
 *
 * Only Next.js functions and auth (Better Auth) are mocked.
 * EnrollmentService is the real implementation backed by a test DB.
 */

// Mock next/navigation
const mockRedirect = vi.fn();
const mockForbidden = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("REDIRECT");
  },
  forbidden: (...args: unknown[]) => {
    mockForbidden(...args);
    throw new Error("FORBIDDEN");
  },
}));

// Mock next/headers
const mockHeaders = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

// Mock auth service (Better Auth layer)
const mockGetSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: () =>
    Promise.resolve({
      getSession: mockGetSession,
    }),
}));

const dbIt = withTestDb(it);

beforeEach(() => {
  vi.clearAllMocks();
  mockHeaders.mockResolvedValue(new Headers());
});

describe("PageGuard.requireStudentLogin", () => {
  dbIt(
    "should redirect to /student/login when no session exists",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue(null);

      await expect(guard.requireStudentLogin()).rejects.toThrow("REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/student/login");
    },
  );

  dbIt(
    "should call forbidden when session role is not student",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue({ role: "admin", userId: "admin-1" });

      await expect(guard.requireStudentLogin()).rejects.toThrow("FORBIDDEN");
      expect(mockForbidden).toHaveBeenCalled();
    },
  );

  dbIt(
    "should return StudentSession when authenticated as student",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue({
        role: "student",
        userId: "user-1",
        username: "john",
        studentId: "student-1",
      });

      const session = await guard.requireStudentLogin();

      expect(session.role).toBe("student");
      expect(session.studentId).toBe("student-1");
      expect(session.username).toBe("john");
    },
  );
});

describe("PageGuard.requireAdminLogin", () => {
  dbIt(
    "should redirect to /admin/login when no session exists",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue(null);

      await expect(guard.requireAdminLogin()).rejects.toThrow("REDIRECT");
      expect(mockRedirect).toHaveBeenCalledWith("/admin/login");
    },
  );

  dbIt(
    "should call forbidden when session role is not admin",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue({ role: "student", userId: "user-1" });

      await expect(guard.requireAdminLogin()).rejects.toThrow("FORBIDDEN");
      expect(mockForbidden).toHaveBeenCalled();
    },
  );

  dbIt(
    "should return AdminSession when authenticated as admin",
    async ({ db }) => {
      const guard = new PageGuard(new EnrollmentService(db));
      mockGetSession.mockResolvedValue({
        role: "admin",
        userId: "admin-1",
        email: "admin@example.com",
      });

      const session = await guard.requireAdminLogin();

      expect(session.role).toBe("admin");
      expect(session.email).toBe("admin@example.com");
    },
  );
});

describe("PageGuard.requireEnrollment", () => {
  dbIt(
    "should call forbidden when student is not enrolled in the course",
    async ({ db }) => {
      const enrollmentService = new EnrollmentService(db);
      const guard = new PageGuard(enrollmentService);

      await expect(
        guard.requireEnrollment("course-1", "student-1"),
      ).rejects.toThrow("FORBIDDEN");
      expect(mockForbidden).toHaveBeenCalled();
    },
  );

  dbIt("should pass through when student is enrolled", async ({ db }) => {
    const enrollmentService = new EnrollmentService(db);
    await enrollmentService.enrollStudent("course-1", "student-1", "admin-1");
    const guard = new PageGuard(enrollmentService);

    await guard.requireEnrollment("course-1", "student-1");

    expect(mockForbidden).not.toHaveBeenCalled();
  });
});
