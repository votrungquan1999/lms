import { type Collection, type Db, MongoServerError } from "mongodb";

import { isPastEnforcementDeadline } from "./enforcement-deadline";
import type { GradeService } from "./grade-service";
import type { RedoRequestService } from "./redo-request-service";
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
    private readonly redoRequestService: RedoRequestService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.testSubmissions =
      db.collection<TestSubmissionDocument>("test_submission");
  }

  /**
   * Explicitly submits a test for a student. Throws:
   * - "Test not found" if the test doesn't exist in this service's school.
   * - "Test has already been submitted" if the test already has an active
   *   (non-soft-deleted) submission.
   */
  async submitTest(testId: string, studentId: string): Promise<void> {
    // Resolve the test before anything else — a missing test must never
    // fall through to "no time limit, not practice" and accept the write.
    const test = await this.testService.requireTest(testId);

    const existing = await this.testSubmissions.findOne({
      testId,
      studentId,
      deletedAt: null,
    });
    if (existing) {
      throw new Error("Test has already been submitted");
    }

    // Past deadline + grace the hand-in is still accepted, recorded at the
    // deadline: the attempt ended then, and the saved answers are what counts.
    const start = await this.testStartService.getActiveStart(testId, studentId);
    const submittedAt =
      start &&
      test.timeLimitMinutes !== null &&
      isPastEnforcementDeadline(
        start.startedAt,
        test.timeLimitMinutes,
        this.now(),
      )
        ? new Date(start.startedAt.getTime() + test.timeLimitMinutes * 60_000)
        : new Date();

    try {
      await this.testSubmissions.insertOne({
        id: crypto.randomUUID(),
        testId,
        studentId,
        submittedAt,
        deletedAt: null,
        releasedAt: null,
        releasedBy: null,
      });
    } catch (error) {
      // The unique index refused a hand-in that raced past the check above.
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new Error("Test has already been submitted");
      }
      throw error;
    }

    // Practice tests are purely formative — never create grades (D2/D9).
    if (!test.isPractice) {
      await this.gradeService.autoGradeTest(testId, studentId);
    }
  }

  /**
   * Hands in a timed attempt whose time ran out without a hand-in, with the
   * answers saved so far, stamped at the deadline (not at the moment someone
   * opens a page). Does nothing for an untimed test, an attempt that has not
   * started, or one still inside deadline + grace (the browser's own hand-in
   * at 00:00 gets that minute).
   */
  async handInIfExpired(testId: string, studentId: string): Promise<void> {
    // Null-safe: status lookups run for tests that may be gone.
    const test = await this.testService.getTest(testId);
    if (!test || test.timeLimitMinutes === null) return;

    const start = await this.testStartService.getActiveStart(testId, studentId);
    if (
      !start ||
      !isPastEnforcementDeadline(
        start.startedAt,
        test.timeLimitMinutes,
        this.now(),
      )
    ) {
      return;
    }

    // A redo with an expired start (an attempt the redo never restarted) replaces the old hand-in.
    const redo = await this.redoRequestService.getActiveRedoRequest(
      testId,
      studentId,
    );
    const submittedAt = new Date(
      start.startedAt.getTime() + test.timeLimitMinutes * 60_000,
    );
    let wrote: boolean;
    if (redo) {
      // Only the caller that wins the claim replaces the old hand-in; the rest see it as handed in.
      const claimed = await this.redoRequestService.claimActiveRedoRequest(
        testId,
        studentId,
      );
      if (!claimed) return;
      wrote = await this.replaceActive(testId, studentId, submittedAt);
    } else if (await this.isTestSubmitted(testId, studentId)) {
      return;
    } else {
      wrote = await this.insertIfAbsent(testId, studentId, submittedAt);
    }
    // Only the call that wrote the row grades, so concurrent callers never double-grade.
    if (wrote && !test.isPractice) {
      await this.gradeService.autoGradeTest(testId, studentId);
    }
  }

  /**
   * Swaps the active hand-in for a fresh one in a single write, so a page
   * arriving mid-swap never finds the student without an active row. The
   * replaced attempt is kept as a soft-deleted row. With no active row it
   * falls back to a plain insert.
   * @returns True only when this call wrote the new hand-in.
   */
  private async replaceActive(
    testId: string,
    studentId: string,
    submittedAt: Date,
  ): Promise<boolean> {
    const replaced = await this.testSubmissions.findOneAndUpdate(
      { testId, studentId, deletedAt: null },
      {
        $set: {
          id: crypto.randomUUID(),
          submittedAt,
          releasedAt: null,
          releasedBy: null,
        },
      },
      { returnDocument: "before" },
    );
    if (!replaced) return this.insertIfAbsent(testId, studentId, submittedAt);
    // The old attempt keeps its own id and release audit as a soft-deleted row.
    const { _id, ...history } = replaced;
    await this.testSubmissions.insertOne({ ...history, deletedAt: new Date() });
    return true;
  }

  /**
   * Records an active submission unless one exists. A duplicate-key refusal
   * from the unique index counts as "already handed in".
   * @returns True only when this call wrote the row.
   */
  private async insertIfAbsent(
    testId: string,
    studentId: string,
    submittedAt: Date,
  ): Promise<boolean> {
    try {
      const result = await this.testSubmissions.updateOne(
        { testId, studentId, deletedAt: null },
        {
          $setOnInsert: {
            id: crypto.randomUUID(),
            submittedAt,
            deletedAt: null,
            releasedAt: null,
            releasedBy: null,
          },
        },
        { upsert: true },
      );
      return result.upsertedCount === 1;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return false;
      }
      throw error;
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
   * Soft-deleted rows are not touched. Throws "Test not found" when the test
   * isn't this school's, and throws when no active submission exists.
   */
  async releaseGradeToStudent(
    testId: string,
    studentId: string,
    userId: string,
  ): Promise<void> {
    await this.testService.requireTest(testId);
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
   * @throws "Test not found" when the test isn't this school's.
   */
  async deleteSubmission(testId: string, studentId: string): Promise<void> {
    await this.testService.requireTest(testId);
    await this.testSubmissions.updateMany(
      { testId, studentId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    );
  }
}
