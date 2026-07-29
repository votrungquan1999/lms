import type { Collection, Db } from "mongodb";

import { isPastEnforcementDeadline } from "./enforcement-deadline";
import type { GradeService } from "./grade-service";
import type { TestService } from "./test-service";
import type { TestStartService } from "./test-start-service";

/**
 * Test submission document stored in the `test_submission` collection.
 * One *active* row per (testId, studentId). When the redo flow deletes a
 * submission we soft-delete (set `deletedAt`) so the historical row remains
 * queryable and any audit data on it (e.g. per-student release fields)
 * survives the redo cycle.
 */
export interface TestSubmissionDocument {
  id: string;
  testId: string;
  studentId: string;
  submittedAt: Date;
  deletedAt: Date | null;
  /** When the admin released this individual student's grades. */
  releasedAt: Date | null;
  /** Admin userId that released this individual student's grades. */
  releasedBy: string | null;
}

/**
 * Client-facing shape returned by `getActiveSubmission`. Keeps audit fields
 * (`releasedAt`, `releasedBy`) but does not expose `deletedAt` — by definition,
 * an active submission is the one row with `deletedAt: null`.
 */
export interface TestSubmissionActive {
  id: string;
  testId: string;
  studentId: string;
  submittedAt: Date;
  releasedAt: Date | null;
  releasedBy: string | null;
}

/**
 * TestSubmissionService — manages the `test_submission` collection.
 * Tracks explicit test submissions by students.
 */
export class TestSubmissionService {
  private readonly testSubmissions: Collection<TestSubmissionDocument>;

  constructor(
    db: Db,
    private readonly gradeService: GradeService,
    private readonly testService: TestService,
    private readonly testStartService: TestStartService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.testSubmissions =
      db.collection<TestSubmissionDocument>("test_submission");
  }

  /**
   * Explicitly submits a test for a student.
   * Throws if the test already has an active (non-soft-deleted) submission.
   */
  async submitTest(testId: string, studentId: string): Promise<void> {
    const existing = await this.testSubmissions.findOne({
      testId,
      studentId,
      deletedAt: null,
    });
    if (existing) {
      throw new Error("Test has already been submitted");
    }

    const test = await this.testService.getTest(testId);
    const start = await this.testStartService.getActiveStart(testId, studentId);
    if (
      isPastEnforcementDeadline(
        start?.startedAt ?? null,
        test?.timeLimitMinutes ?? null,
        this.now(),
      )
    ) {
      throw new Error("Time limit exceeded");
    }

    await this.testSubmissions.insertOne({
      id: crypto.randomUUID(),
      testId,
      studentId,
      submittedAt: new Date(),
      deletedAt: null,
      releasedAt: null,
      releasedBy: null,
    });

    // Practice tests are purely formative — never create grades (D2/D9).
    if (!test?.isPractice) {
      await this.gradeService.autoGradeTest(testId, studentId);
    }
  }

  /**
   * Checks if a test has an active (non-soft-deleted) submission for a student.
   */
  async isTestSubmitted(testId: string, studentId: string): Promise<boolean> {
    const doc = await this.testSubmissions.findOne({
      testId,
      studentId,
      deletedAt: null,
    });
    return doc !== null;
  }

  /**
   * Returns the active (non-soft-deleted) submission for a student on a test,
   * including the audit fields used by the per-student grade-release flow.
   * Missing `releasedAt` / `releasedBy` on legacy rows are coerced to null.
   * Returns null when no active submission exists.
   */
  async getActiveSubmission(
    testId: string,
    studentId: string,
  ): Promise<TestSubmissionActive | null> {
    const doc = await this.testSubmissions.findOne({
      testId,
      studentId,
      deletedAt: null,
    });
    if (!doc) return null;
    return {
      id: doc.id,
      testId: doc.testId,
      studentId: doc.studentId,
      submittedAt: doc.submittedAt,
      releasedAt: doc.releasedAt ?? null,
      releasedBy: doc.releasedBy ?? null,
    };
  }

  /**
   * Stamps `releasedAt` and `releasedBy` on the active submission for this
   * student, so the per-student release tier of the visibility gate opens.
   * Re-calling refreshes both fields (matches `releaseGrades` semantics).
   * Soft-deleted rows are not touched. Throws if no active submission exists.
   */
  async releaseGradeToStudent(
    testId: string,
    studentId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.testSubmissions.updateOne(
      { testId, studentId, deletedAt: null },
      { $set: { releasedAt: new Date(), releasedBy: userId } },
    );
    if (result.matchedCount === 0) {
      throw new Error("No active submission to release");
    }
  }

  /**
   * Soft-deletes the active submission (used in the redo flow). The row stays
   * in the collection with `deletedAt` set so audit data on it is preserved;
   * subsequent reads via `isTestSubmitted` / `submitTest` ignore it.
   */
  async deleteSubmission(testId: string, studentId: string): Promise<void> {
    await this.testSubmissions.updateMany(
      { testId, studentId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }
}
