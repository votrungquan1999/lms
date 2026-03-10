/**
 * Session abstraction for the LMS system.
 *
 * Provides typed session classes for admins and students,
 * each carrying role-specific data. Type guards allow
 * safe narrowing in route handlers and server actions.
 */

type SessionRole = "admin" | "student";

/**
 * Base session — common fields shared by all session types.
 * Not instantiated directly; use AdminSession or StudentSession.
 */
abstract class Session {
  abstract readonly role: SessionRole;
  readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }
}

/**
 * Admin session — created after Google OAuth sign-in
 * for a user whose email is in the ADMIN_EMAILS whitelist.
 */
export class AdminSession extends Session {
  readonly role = "admin" as const;
  readonly email: string;

  constructor(input: { userId: string; email: string }) {
    super(input.userId);
    this.email = input.email;
  }
}

/**
 * Student session — created after username/password sign-in.
 */
export class StudentSession extends Session {
  readonly role = "student" as const;
  readonly username: string;

  constructor(input: { userId: string; username: string }) {
    super(input.userId);
    this.username = input.username;
  }
}

/**
 * Type guard: narrows a Session to AdminSession.
 */
export function isAdminSession(session: Session): session is AdminSession {
  return session.role === "admin";
}

/**
 * Type guard: narrows a Session to StudentSession.
 */
export function isStudentSession(session: Session): session is StudentSession {
  return session.role === "student";
}

export { Session };
export type { SessionRole };
