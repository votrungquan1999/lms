import { forbidden, redirect } from "next/navigation";
import type { EnrollmentService } from "src/lib/enrollment-service";
import {
  type AdminSession,
  isSchoolAdminSession,
  Role,
  type SchoolAdminSession,
  type Session,
  type StudentSession,
} from "src/lib/session";

/**
 * The session lookup PageGuard depends on — constructor-injected so
 * tests supply a fake instead of mocking `src/lib/auth-singleton`. The real
 * implementation (wired in `services-singleton.ts`) reads `headers()` and
 * calls the real `AuthService` itself; PageGuard never touches either.
 */
export interface PageGuardSessionLookup {
  getSession(): Promise<Session | null>;
  isAdminEmail(email: string): Promise<boolean>;
}

/**
 * PageGuard — auth and authorization guards for server-rendered pages.
 * Services are injected via constructor for testability.
 */
export class PageGuard {
  private readonly enrollmentService: EnrollmentService;
  private readonly sessionLookup: PageGuardSessionLookup;

  constructor(
    enrollmentService: EnrollmentService,
    sessionLookup: PageGuardSessionLookup,
  ) {
    this.enrollmentService = enrollmentService;
    this.sessionLookup = sessionLookup;
  }

  /**
   * Requires an authenticated student session.
   * Redirects to /student/login if unauthenticated, forbidden if wrong role.
   */
  async requireStudentLogin(): Promise<StudentSession> {
    const session = await this.sessionLookup.getSession();
    if (!session) {
      redirect("/student/login");
    }
    if (session.role !== Role.Student) {
      forbidden();
    }

    return session as StudentSession;
  }

  /**
   * Requires an authenticated admin session (Tier 1 — no school required).
   * Redirects to /admin/login if unauthenticated, forbidden if wrong role.
   */
  async requireAdminLogin(): Promise<AdminSession> {
    const session = await this.sessionLookup.getSession();
    if (!session) {
      redirect("/admin/login");
    }
    if (session.role !== Role.Admin) {
      forbidden();
    }

    return session as AdminSession;
  }

  /**
   * Requires an authenticated OWNER session (Tier 2, D23/D24) — the role-
   * management page's own guard, on top of the layout's Tier-1 admin guard.
   * Redirects to /admin/login if unauthenticated, forbidden if the session
   * is not a recorded Admin OR the email is not in ADMIN_EMAILS. Requiring
   * both is deliberate: the email list alone would hand an attacker who
   * merely claims a whitelisted address the power to GRANT admin — the
   * original escalation in its worst form.
   */
  async requireRoleManagerLogin(): Promise<AdminSession> {
    const adminSession = await this.requireAdminLogin();
    const isOwner = await this.sessionLookup.isAdminEmail(adminSession.email);
    if (!isOwner) {
      forbidden();
    }

    return adminSession;
  }

  /**
   * Requires an authenticated admin session that ALSO has an active school.
   * Every school-scoped page uses this, never `requireAdminLogin`.
   * Redirects to /admin/login if unauthenticated, forbidden if wrong role,
   * and to /admin/no-school if there is no active school — never to itself,
   * since `/admin/no-school` guards with `requireAdminLogin()` only.
   */
  async requireSchoolAdmin(): Promise<SchoolAdminSession> {
    const adminSession = await this.requireAdminLogin();
    if (!isSchoolAdminSession(adminSession)) {
      redirect("/admin/no-school");
    }

    return adminSession;
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
