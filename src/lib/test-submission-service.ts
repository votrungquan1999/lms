import type { Collection, Db } from "mongodb";

import type { GradeService } from "./grade-service";

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

  constructor(
    db: Db,
    private readonly gradeService: GradeService,
  ) {
    this.testSubmissions =
      db.collection<TestSubmissionDocument>("test_submission");
  }

  /**
   * Explicitly submits a test for a student.
   * Throws if the test has already been submitted.
   */
  async submitTest(testId: string, studentId: string): Promise<void> {
    const existing = await this.testSubmissions.findOne({ testId, studentId });
    if (existing) {
      throw new Error("Test has already been submitted");
    }

    await this.testSubmissions.insertOne({
      id: crypto.randomUUID(),
      testId,
      studentId,
      submittedAt: new Date(),
    });

    // Auto-grade applicable questions
    await this.gradeService.autoGradeTest(testId, studentId);
  }

  /**
   * Checks if a test has been explicitly submitted by a student.
   */
  async isTestSubmitted(testId: string, studentId: string): Promise<boolean> {
    const doc = await this.testSubmissions.findOne({ testId, studentId });
    return doc !== null;
  }

  /**
   * Deletes a previous submission so the student can resubmit (used in redo flow).
   */
  async deleteSubmission(testId: string, studentId: string): Promise<void> {
    await this.testSubmissions.deleteMany({ testId, studentId });
  }
}
