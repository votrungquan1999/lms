import type { Collection, Db } from "mongodb";

/**
 * A test-start document stored in the `test_start` collection.
 * One active start per (testId, studentId); active = `deletedAt` is null.
 */
export interface TestStartDocument {
  id: string;
  testId: string;
  studentId: string;
  startedAt: Date;
  createdAt: Date;
  createdBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/**
 * Client-facing test-start interface.
 */
export interface TestStart {
  testId: string;
  studentId: string;
  startedAt: Date;
}

/**
 * TestStartService — manages the `test_start` collection. Records when a
 * student starts a timed test (once, never reset) so the enforcement deadline
 * (`startedAt + timeLimit`) can be derived server-side.
 */
export class TestStartService {
  private readonly testStarts: Collection<TestStartDocument>;

  constructor(db: Db) {
    this.testStarts = db.collection<TestStartDocument>("test_start");
  }

  /**
   * Records the start of a timed test. Idempotent: a later call never resets
   * the original `startedAt`.
   * @param testId - The test being started.
   * @param studentId - The student starting it.
   * @param startedAt - The start timestamp (injected for determinism).
   */
  async recordStart(
    testId: string,
    studentId: string,
    startedAt: Date,
  ): Promise<void> {
    await this.testStarts.updateOne(
      { testId, studentId, deletedAt: null },
      {
        $setOnInsert: {
          id: crypto.randomUUID(),
          testId,
          studentId,
          startedAt,
          createdAt: startedAt,
          createdBy: studentId,
          deletedAt: null,
          deletedBy: null,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Returns the active (non-deleted) start for a (testId, studentId), or null.
   * @param testId - The test.
   * @param studentId - The student.
   */
  async getActiveStart(
    testId: string,
    studentId: string,
  ): Promise<TestStart | null> {
    const doc = await this.testStarts.findOne({
      testId,
      studentId,
      deletedAt: null,
    });
    return doc ? this.toTestStart(doc) : null;
  }

  private toTestStart(doc: TestStartDocument): TestStart {
    return {
      testId: doc.testId,
      studentId: doc.studentId,
      startedAt: doc.startedAt,
    };
  }
}
