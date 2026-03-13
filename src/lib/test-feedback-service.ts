import type { Collection, Db } from "mongodb";

/**
 * Test feedback document stored in the `test_feedback` collection.
 * One per (testId, studentId) — upsert model.
 */
export interface TestFeedbackDocument {
  id: string;
  testId: string;
  studentId: string;
  feedback: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Input for setting overall test feedback.
 */
export interface SetTestFeedbackInput {
  testId: string;
  studentId: string;
  feedback: string;
  gradedBy: string;
}

/**
 * TestFeedbackService — manages the `test_feedback` collection.
 * Handles overall test-level feedback for students.
 */
export class TestFeedbackService {
  private readonly testFeedback: Collection<TestFeedbackDocument>;

  constructor(db: Db) {
    this.testFeedback = db.collection<TestFeedbackDocument>("test_feedback");
  }

  /**
   * Sets (or updates) overall test feedback for a student.
   */
  async setTestFeedback(input: SetTestFeedbackInput): Promise<void> {
    const now = new Date();
    await this.testFeedback.updateOne(
      { testId: input.testId, studentId: input.studentId },
      {
        $set: {
          feedback: input.feedback,
          updatedAt: now,
          updatedBy: input.gradedBy,
        },
        $setOnInsert: {
          id: crypto.randomUUID(),
          testId: input.testId,
          studentId: input.studentId,
          createdAt: now,
          createdBy: input.gradedBy,
        },
      },
      { upsert: true },
    );
  }

  /**
   * Gets overall test feedback for a student. Returns null if not set.
   */
  async getTestFeedback(
    testId: string,
    studentId: string,
  ): Promise<string | null> {
    const doc = await this.testFeedback.findOne({ testId, studentId });
    return doc?.feedback ?? null;
  }
}
