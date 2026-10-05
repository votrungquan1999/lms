import type { Collection, Db } from "mongodb";
import { type Course, type CourseDocument, toCourse } from "./course-service";
import {
  type Student,
  type StudentDocument,
  toStudent,
} from "./student-service";

/**
 * A course found by its invite token, with the school it belongs to. `null`
 * school means the course is not yet assigned, which callers treat as an
 * invalid invite.
 */
export interface InviteCourse {
  course: Course;
  schoolId: string | null;
}

/** An invite course known to belong to a school. */
export interface AssignedInviteCourse {
  course: Course;
  schoolId: string;
}

/**
 * SchoolDirectory — the lookups that must see every school: invite links
 * (no session to take a school from), and student usernames and sign-in
 * accounts, which are unique across all schools.
 * Never used to list or change a school's records.
 */
export class SchoolDirectory {
  private readonly courses: Collection<CourseDocument>;
  private readonly students: Collection<StudentDocument>;

  constructor(db: Db) {
    this.courses = db.collection<CourseDocument>("course");
    this.students = db.collection<StudentDocument>("student");
  }

  /**
   * Looks up a course by its invite token, across every school. A falsy
   * token returns null before any query runs, and the query itself requires
   * a string match — the Mongo driver serializes `undefined` to `null` (no
   * `ignoreUndefined` on the client), and `{ inviteToken: null }` alone
   * would match every course with no active link.
   * @param token - The invite token from the join URL.
   * @returns The course and its school, or null when no course has it.
   */
  async findCourseByInviteToken(token: string): Promise<InviteCourse | null> {
    if (!token) {
      return null;
    }
    const doc = await this.courses.findOne({
      inviteToken: { $eq: token, $type: "string" },
    });
    if (!doc) {
      return null;
    }
    return { course: toCourse(doc), schoolId: doc.schoolId ?? null };
  }

  /**
   * Like `findCourseByInviteToken`, but a course with no school folds into
   * "not found" — the join flows treat both as an invalid invite.
   * @param token - The invite token from the join URL.
   * @returns The course and its school, or null.
   */
  async findAssignedInviteCourse(
    token: string,
  ): Promise<AssignedInviteCourse | null> {
    const invite = await this.findCourseByInviteToken(token);
    if (!invite?.schoolId) {
      return null;
    }
    return { course: invite.course, schoolId: invite.schoolId };
  }

  /**
   * Finds a student by username, in any school.
   * @param username - The exact (case-sensitive) username.
   * @returns The student, or null when no school has that username.
   */
  async findByUsername(username: string): Promise<Student | null> {
    const doc = await this.students.findOne({ username });
    if (!doc) {
      return null;
    }
    return toStudent(doc);
  }

  /**
   * Finds a student by their Better Auth user ID, in any school.
   * @param authUserId - The Better Auth user id.
   * @returns The student, or null when the account has no student profile.
   */
  async findByAuthUserId(authUserId: string): Promise<Student | null> {
    const doc = await this.students.findOne({ authUserId });
    if (!doc) {
      return null;
    }
    return toStudent(doc);
  }

  /**
   * Returns the subset of the given usernames already taken in any school,
   * using a single `$in` query.
   * @param usernames - Candidate usernames to check.
   * @returns The usernames that are already taken (empty if none / no input).
   */
  async findExistingUsernames(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];
    const docs = await this.students
      .find({ username: { $in: usernames } })
      .toArray();
    return docs.map((doc) => doc.username);
  }
}
