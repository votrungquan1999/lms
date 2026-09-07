import { type Collection, type Db, MongoServerError } from "mongodb";

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
 * at a time — enforced by a partial unique index (see `ensureIndexes` in
 * database.ts), not just the app-level pre-check in `createRequest`.
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
   * already pending. The pre-check below is a fast path, not the guard — a
   * partial unique index on {courseId, studentId, status: pending} is the
   * real backstop against two concurrent calls both passing the pre-check.
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

    try {
      await this.joinRequests.insertOne(doc);
    } catch (error) {
      // Lost the race to the unique index — read back the winner instead of
      // surfacing a duplicate-key crash to the caller.
      if (error instanceof MongoServerError && error.code === 11000) {
        const racedRequest = await this.getPendingRequest(
          input.courseId,
          input.studentId,
        );
        if (racedRequest) {
          return racedRequest;
        }
      }
      throw error;
    }

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
