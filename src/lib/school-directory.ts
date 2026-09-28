import type { Collection, Db } from "mongodb";
import { type Course, type CourseDocument, toCourse } from "./course-service";

/**
 * A course found by its invite token, with the school it belongs to. `null`
 * school means the course is not yet assigned, which callers treat as an
 * invalid invite.
 */
export interface InviteCourse {
  course: Course;
  schoolId: string | null;
}

/**
 * SchoolDirectory — the lookups that must see every school, for callers
 * that have no session to take a school from (an anonymous invite visitor).
 * Never used to list or change a school's records.
 */
export class SchoolDirectory {
  private readonly courses: Collection<CourseDocument>;

  constructor(db: Db) {
    this.courses = db.collection<CourseDocument>("course");
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
}
