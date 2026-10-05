/**
 * Session abstraction for the LMS system.
 *
 * Provides typed session classes for admins and students,
 * each carrying role-specific data. Type guards allow
 * safe narrowing in route handlers and server actions.
 */

import type { UserSchool } from "./school-service";

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
 * `school` is the admin's active school, or `null` when none resolves; it is
 * a required constructor field so no caller can forget to consider it.
 */
export class AdminSession extends Session {
  readonly role = Role.Admin;
  readonly email: string;
  readonly school: UserSchool | null;

  constructor(input: {
    userId: string;
    email: string;
    school: UserSchool | null;
  }) {
    super(input.userId);
    this.email = input.email;
    this.school = input.school;
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
  /** The student's one school, from their student record. */
  readonly schoolId: string;

  constructor(input: {
    userId: string;
    username: string;
    studentId: string;
    schoolId: string;
  }) {
    super(input.userId);
    this.username = input.username;
    this.studentId = input.studentId;
    this.schoolId = input.schoolId;
  }
}

/**
 * Type guard: narrows a Session to AdminSession.
 */
export function isAdminSession(session: Session): session is AdminSession {
  return session.role === Role.Admin;
}

/**
 * An AdminSession whose `school` is non-null. Same shape as AdminSession —
 * just narrowed, so `requireAdminSession` and `requireSchoolAdmin()` can
 * hand callers `session.school.id` with no non-null assertion.
 */
export interface SchoolAdminSession extends AdminSession {
  readonly school: UserSchool;
}

/**
 * Type guard: narrows an AdminSession to SchoolAdminSession.
 */
export function isSchoolAdminSession(
  session: AdminSession,
): session is SchoolAdminSession {
  return session.school !== null;
}

/**
 * Type guard: narrows a Session to StudentSession.
 */
export function isStudentSession(session: Session): session is StudentSession {
  return session.role === Role.Student;
}

export { Session };
