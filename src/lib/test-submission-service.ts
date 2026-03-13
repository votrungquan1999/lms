import type { Collection, Db } from "mongodb";

/**
 * Test submission document stored in the `test_submission` collection.
 * One per (testId, studentId) — marks the test as explicitly submitted.
 */
export interface TestSubmissionDocument {
  id: string;
  testId: string;
  studentId: string;
  submittedAt: Date;
}

/**
 * TestSubmissionService — manages the `test_submission` collection.
 * Tracks explicit test submissions by students.
 */
export class TestSubmissionService {
  private readonly testSubmissions: Collection<TestSubmissionDocument>;

  constructor(db: Db) {
    this.testSubmissions =
      db.collection<TestSubmissionDocument>("test_submission");
  }

  /**
   * Explicitly submits a test for a student. Idempotent — skips if already submitted.
   */
  async submitTest(testId: string, studentId: string): Promise<void> {
    const existing = await this.testSubmissions.findOne({ testId, studentId });
    if (existing) return;

    await this.testSubmissions.insertOne({
      id: crypto.randomUUID(),
      testId,
      studentId,
      submittedAt: new Date(),
    });
  }

  /**
   * Checks if a test has been explicitly submitted by a student.
   */
  async isTestSubmitted(testId: string, studentId: string): Promise<boolean> {
    const doc = await this.testSubmissions.findOne({ testId, studentId });
    return doc !== null;
  }
}
