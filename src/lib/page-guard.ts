import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { getAuthService } from "src/lib/auth-singleton";
import type { EnrollmentService } from "src/lib/enrollment-service";
import type { AdminSession, StudentSession } from "src/lib/session";

/**
 * PageGuard — auth and authorization guards for server-rendered pages.
 * Services are injected via constructor for testability.
 */
export class PageGuard {
  private readonly enrollmentService: EnrollmentService;

  constructor(enrollmentService: EnrollmentService) {
    this.enrollmentService = enrollmentService;
  }

  /**
   * Requires an authenticated student session.
   * Redirects to /student/login if unauthenticated, forbidden if wrong role.
   */
  async requireStudentLogin(): Promise<StudentSession> {
    const requestHeaders = await headers();
    const authService = await getAuthService();

    const session = await authService.getSession(requestHeaders);
    if (!session) {
      redirect("/student/login");
    }
    if (session.role !== "student") {
      forbidden();
    }

    return session as StudentSession;
  }

  /**
   * Requires an authenticated admin session.
   * Redirects to /admin/login if unauthenticated, forbidden if wrong role.
   */
  async requireAdminLogin(): Promise<AdminSession> {
    const requestHeaders = await headers();
    const authService = await getAuthService();

    const session = await authService.getSession(requestHeaders);
    if (!session) {
      redirect("/admin/login");
    }
    if (session.role !== "admin") {
      forbidden();
    }

    return session as AdminSession;
  }

  /**
   * Requires a student to be enrolled in the specified course.
   * Calls forbidden() if not enrolled.
   */
  async requireEnrollment(courseId: string, studentId: string): Promise<void> {
    const enrolled = await this.enrollmentService.isEnrolled(
      courseId,
      studentId,
    );
    if (!enrolled) {
      forbidden();
    }
  }
}
