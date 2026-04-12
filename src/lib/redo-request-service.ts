import type { Collection, Db } from "mongodb";

/**
 * A redo request document stored in the `redo_request` collection.
 * One active request per (testId, studentId) at a time.
 * active = resolvedAt is null
 * resolved = resolvedAt is set (student resubmitted)
 */
export interface RedoRequestDocument {
  id: string;
  testId: string;
  studentId: string;
  requestedBy: string;
  requestedAt: Date;
  resolvedAt: Date | null;
}

/**
 * Client-facing redo request interface.
 */
export interface RedoRequest {
  id: string;
  testId: string;
  studentId: string;
  requestedBy: string;
  requestedAt: Date;
  resolvedAt: Date | null;
}

/**
 * RedoRequestService — manages the `redo_request` collection.
 *
 * Flow:
 *   1. Admin calls requestRedo(testId, studentId, requestedBy)
 *      → creates a new document with resolvedAt = null
 *   2. Student's test page reads getActiveRedoRequest(testId, studentId)
 *      → shows "redo required" banner when non-null
 *   3. Student resubmits → resolveRedoRequest(testId, studentId)
 *      → sets resolvedAt = now → banner disappears
 */
export class RedoRequestService {
  private readonly redoRequests: Collection<RedoRequestDocument>;

  constructor(db: Db) {
    this.redoRequests = db.collection<RedoRequestDocument>("redo_request");
  }

  /**
   * Creates a new active redo request for the given (testId, studentId) pair.
   * If an active request already exists it is left in place (idempotent insert).
   */
  async requestRedo(
    testId: string,
    studentId: string,
    requestedBy: string,
  ): Promise<RedoRequest> {
    const doc: RedoRequestDocument = {
      id: crypto.randomUUID(),
      testId,
      studentId,
      requestedBy,
      requestedAt: new Date(),
      resolvedAt: null,
    };
    await this.redoRequests.insertOne(doc);
    return this.toRedoRequest(doc);
  }

  /**
   * Returns the most recent active (unresolved) redo request for a student on a test.
   * Returns null if no active request exists.
   */
  async getActiveRedoRequest(
    testId: string,
    studentId: string,
  ): Promise<RedoRequest | null> {
    const doc = await this.redoRequests.findOne(
      { testId, studentId, resolvedAt: null },
      { sort: { requestedAt: -1 } },
    );
    return doc ? this.toRedoRequest(doc) : null;
  }

  /**
   * Marks all active redo requests for (testId, studentId) as resolved.
   * Called when the student resubmits the test.
   * No-op if there is no active request.
   */
  async resolveRedoRequest(testId: string, studentId: string): Promise<void> {
    await this.redoRequests.updateMany(
      { testId, studentId, resolvedAt: null },
      { $set: { resolvedAt: new Date() } },
    );
  }

  private toRedoRequest(doc: RedoRequestDocument): RedoRequest {
    return {
      id: doc.id,
      testId: doc.testId,
      studentId: doc.studentId,
      requestedBy: doc.requestedBy,
      requestedAt: doc.requestedAt,
      resolvedAt: doc.resolvedAt,
    };
  }
}
