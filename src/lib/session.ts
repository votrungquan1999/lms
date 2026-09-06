/**
 * Session abstraction for the LMS system.
 *
 * Provides typed session classes for admins and students,
 * each carrying role-specific data. Type guards allow
 * safe narrowing in route handlers and server actions.
 */

/**
 * The two kinds of person the school records: an administrator or a student.
 */
export enum Role {
  Admin = "admin",
  Student = "student",
}

/**
 * Base session — common fields shared by all session types.
 * Not instantiated directly; use AdminSession or StudentSession.
 */
abstract class Session {
  abstract readonly role: Role;
  readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }
}

/**
 * Admin session — created for a user whose recorded `role` is Admin.
 */
export class AdminSession extends Session {
  readonly role = Role.Admin;
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
  readonly role = Role.Student;
  readonly username: string;
  /** Domain student document ID (from the `student` collection). */
  readonly studentId: string;

  constructor(input: { userId: string; username: string; studentId: string }) {
    super(input.userId);
    this.username = input.username;
    this.studentId = input.studentId;
  }
}

/**
 * Type guard: narrows a Session to AdminSession.
 */
export function isAdminSession(session: Session): session is AdminSession {
  return session.role === Role.Admin;
}

/**
 * Type guard: narrows a Session to StudentSession.
 */
export function isStudentSession(session: Session): session is StudentSession {
  return session.role === Role.Student;
}

export { Session };
