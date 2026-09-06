import type { Collection, Db } from "mongodb";

/**
 * The three states a course join request moves through. A TS enum, never a
 * string union (repo rule) — `grading/page.tsx`'s `FilterValue` union is a
 * live violation of this rule and must not be copied.
 */
export enum JoinRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
}

/**
 * A course join request document stored in the `course_join_request`
 * collection. At most one Pending row may exist per (courseId, studentId)
 * at a time — app-level uniqueness, no unique index (no `createIndex` call
 * exists anywhere in this repo).
 */
export interface CourseJoinRequestDocument {
  id: string;
  courseId: string;
  studentId: string;
  status: JoinRequestStatus;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

/**
 * Client-facing course join request interface.
 */
export interface CourseJoinRequest {
  id: string;
  courseId: string;
  studentId: string;
  status: JoinRequestStatus;
  requestedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

/**
 * Input for creating a join request.
 */
export interface CreateJoinRequestInput {
  courseId: string;
  studentId: string;
}

/**
 * CourseJoinRequestService — manages the `course_join_request` collection.
 * Modelled on `RedoRequestService`'s active/resolved shape.
 */
export class CourseJoinRequestService {
  private readonly joinRequests: Collection<CourseJoinRequestDocument>;

  constructor(db: Db) {
    this.joinRequests = db.collection<CourseJoinRequestDocument>(
      "course_join_request",
    );
  }

  /**
   * Creates a Pending join request for (courseId, studentId), unless one is
   * already pending — read-then-write, no unique index (matches every other
   * uniqueness rule in this repo). A genuine race between two concurrent
   * calls can still both pass the read and both insert; see the caller for
   * how that outcome is handled.
   */
  async createRequest(
    input: CreateJoinRequestInput,
  ): Promise<CourseJoinRequest> {
    const existing = await this.getPendingRequest(
      input.courseId,
      input.studentId,
    );
    if (existing) {
      return existing;
    }

    const doc: CourseJoinRequestDocument = {
      id: crypto.randomUUID(),
      courseId: input.courseId,
      studentId: input.studentId,
      status: JoinRequestStatus.Pending,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null,
    };
    await this.joinRequests.insertOne(doc);
    return this.toCourseJoinRequest(doc);
  }

  /**
   * Returns the pending request for (courseId, studentId), or null.
   */
  async getPendingRequest(
    courseId: string,
    studentId: string,
  ): Promise<CourseJoinRequest | null> {
    const doc = await this.joinRequests.findOne({
      courseId,
      studentId,
      status: JoinRequestStatus.Pending,
    });
    return doc ? this.toCourseJoinRequest(doc) : null;
  }

  private toCourseJoinRequest(
    doc: CourseJoinRequestDocument,
  ): CourseJoinRequest {
    return {
      id: doc.id,
      courseId: doc.courseId,
      studentId: doc.studentId,
      status: doc.status,
      requestedAt: doc.requestedAt,
      resolvedAt: doc.resolvedAt,
      resolvedBy: doc.resolvedBy,
    };
  }
}
