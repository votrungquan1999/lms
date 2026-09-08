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
 * Paging window for `listByStatus` — `skip`/`limit` in the Mongo sense.
 */
export interface ListByStatusOptions {
  skip: number;
  limit: number;
}

/**
 * One page of join requests for a status, plus the total row count across
 * every page — the total is what makes real page controls possible instead
 * of a truncating "showing first N" cap (D56/R12).
 */
export interface PagedCourseJoinRequests {
  items: CourseJoinRequest[];
  total: number;
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

  /**
   * Returns the join request with this id, or null.
   */
  async getRequest(id: string): Promise<CourseJoinRequest | null> {
    const doc = await this.joinRequests.findOne({ id });
    return doc ? this.toCourseJoinRequest(doc) : null;
  }

  /**
   * Marks a join request Approved via an atomic compare-and-set — the write
   * itself is the guard, so no separate read can race between check and
   * write the way two admins' concurrent approve/reject clicks could (R6).
   * Caller must claim this BEFORE enrolling the student (D90) — status
   * first, enrollment second, so a losing concurrent Reject is refused
   * before an enrollment for the turned-down student ever exists. Covers
   * the resulting "approved but not enrolled" crash window by allowing a
   * safe, inert retry: re-approving an already-Approved row succeeds
   * without writing anything new. A Rejected row always refuses (Step 32).
   */
  async approve(requestId: string, resolvedBy: string): Promise<void> {
    const result = await this.joinRequests.updateOne(
      { id: requestId, status: JoinRequestStatus.Pending },
      {
        $set: {
          status: JoinRequestStatus.Approved,
          resolvedAt: new Date(),
          resolvedBy,
        },
      },
    );
    if (result.matchedCount === 1) {
      return;
    }

    const current = await this.joinRequests.findOne({ id: requestId });
    if (current?.status === JoinRequestStatus.Approved) {
      return;
    }
    throw new Error("This request has already been handled");
  }

  /**
   * Marks a join request Rejected via the same atomic compare-and-set as
   * approve() (R6). Status-only — never touches the `enrollment` collection,
   * so an enrollment the student already has by another path (hand-added,
   * bulk import) is left untouched (D66/R7). Unlike approve(), there is no
   * retry path: a Rejected OR Approved row always refuses (Step 32) — an
   * approved request must never flip to Rejected while the enrollment it
   * produced stays untouched (D66), which would leave the two permanently
   * disagreeing.
   */
  async reject(requestId: string, resolvedBy: string): Promise<void> {
    const result = await this.joinRequests.updateOne(
      { id: requestId, status: JoinRequestStatus.Pending },
      {
        $set: {
          status: JoinRequestStatus.Rejected,
          resolvedAt: new Date(),
          resolvedBy,
        },
      },
    );
    if (result.matchedCount === 0) {
      throw new Error("This request has already been handled");
    }
  }

  /**
   * Lists one page of join requests with the given status — R4 keys strictly
   * on the status enum, never a nullable "resolved" field (this driver
   * treats `{field: null}` as matching both an explicit null AND an absent
   * key, so a nullable filter would silently pull in the wrong rows).
   * Waiting sorts oldest-first (nobody is left behind); a resolved status
   * (approved/rejected) sorts newest-first (D56). `_id` breaks ties on
   * `requestedAt` — Mongo's own docs say sort order is undefined across
   * documents with an equal sort key, so without it two rows stamped the
   * same instant could land on both pages, or neither, as skip/limit moves.
   */
  async listByStatus(
    status: JoinRequestStatus,
    options: ListByStatusOptions,
  ): Promise<PagedCourseJoinRequests> {
    const sortDirection = status === JoinRequestStatus.Pending ? 1 : -1;
    const [docs, total] = await Promise.all([
      this.joinRequests
        .find({ status })
        .sort({ requestedAt: sortDirection, _id: sortDirection })
        .skip(options.skip)
        .limit(options.limit)
        .toArray(),
      this.joinRequests.countDocuments({ status }),
    ]);
    return {
      items: docs.map((doc) => this.toCourseJoinRequest(doc)),
      total,
    };
  }

  /**
   * Lists this student's Pending join requests, across every course — used
   * to tell a waiting student their request hasn't been forgotten (Step 34),
   * independent of whether they're already enrolled somewhere else.
   */
  async listByStudent(studentId: string): Promise<CourseJoinRequest[]> {
    const docs = await this.joinRequests
      .find({ studentId, status: JoinRequestStatus.Pending })
      .toArray();
    return docs.map((doc) => this.toCourseJoinRequest(doc));
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
