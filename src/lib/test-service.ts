import type { Collection, Db } from "mongodb";

/**
 * Test document stored in the `test` collection.
 */
export interface TestDocument {
  id: string;
  courseId: string;
  title: string;
  description: string;
  showCorrectAnswerAfterSubmit: boolean;
  showGradeAfterSubmit: boolean;
  /** Exam time limit in minutes; null means untimed. */
  timeLimitMinutes: number | null;
  /** When true, this is a formative practice test: no grades, reveal-on-answer. */
  isPractice: boolean;
  correctAnswersReleasedAt: Date | null;
  gradesReleasedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
}

/**
 * Client-facing test interface.
 */
export interface Test {
  id: string;
  courseId: string;
  title: string;
  description: string;
  showCorrectAnswerAfterSubmit: boolean;
  showGradeAfterSubmit: boolean;
  /** Exam time limit in minutes; null means untimed. */
  timeLimitMinutes: number | null;
  /** When true, this is a formative practice test: no grades, reveal-on-answer. */
  isPractice: boolean;
  correctAnswersReleasedAt: Date | null;
  gradesReleasedAt: Date | null;
  createdAt: Date;
}

/**
 * Input for creating a new test.
 */
export interface CreateTestInput {
  title: string;
  description: string;
  createdBy: string;
  showCorrectAnswerAfterSubmit?: boolean;
  showGradeAfterSubmit?: boolean;
  /** Defaults to false. When true, forbids a non-null timeLimitMinutes (R10). */
  isPractice?: boolean;
  /** Exam time limit in minutes; null/omitted means untimed. Mutually exclusive with isPractice (R10). */
  timeLimitMinutes?: number | null;
}

/**
 * Input for overwriting a test's visibility flags via the admin settings panel.
 */
export interface UpdateTestSettingsInput {
  showGradeAfterSubmit: boolean;
  showCorrectAnswerAfterSubmit: boolean;
  timeLimitMinutes: number | null;
  isPractice: boolean;
  updatedBy: string;
}

/**
 * TestService — manages the `test` collection.
 */
export class TestService {
  private readonly tests: Collection<TestDocument>;

  constructor(db: Db) {
    this.tests = db.collection<TestDocument>("test");
  }

  async createTest(courseId: string, input: CreateTestInput): Promise<Test> {
    if (input.isPractice && input.timeLimitMinutes != null) {
      throw new Error("A practice test cannot have a time limit.");
    }

    const doc: TestDocument = {
      id: crypto.randomUUID(),
      courseId,
      title: input.title,
      description: input.description,
      showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit ?? true,
      showGradeAfterSubmit: input.showGradeAfterSubmit ?? true,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      isPractice: input.isPractice ?? false,
      correctAnswersReleasedAt: null,
      gradesReleasedAt: null,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
    };

    await this.tests.insertOne(doc);

    return this.toTest(doc);
  }

  async getTest(testId: string): Promise<Test | null> {
    const doc = await this.tests.findOne({ id: testId, deletedAt: null });
    return doc ? this.toTest(doc) : null;
  }

  async listTests(courseId: string): Promise<Test[]> {
    const docs = await this.tests
      .find({ courseId, deletedAt: null })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toTest(doc));
  }

  /**
   * Returns every non-deleted test across all courses, sorted by `createdAt` desc.
   * Used by the grading hub and admin dashboard for cross-course aggregation.
   */
  async listAllTests(): Promise<Test[]> {
    const docs = await this.tests
      .find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toTest(doc));
  }

  private toTest(doc: TestDocument): Test {
    return {
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      showCorrectAnswerAfterSubmit: doc.showCorrectAnswerAfterSubmit,
      showGradeAfterSubmit: doc.showGradeAfterSubmit,
      timeLimitMinutes: doc.timeLimitMinutes ?? null,
      isPractice: doc.isPractice ?? false,
      correctAnswersReleasedAt: doc.correctAnswersReleasedAt,
      gradesReleasedAt: doc.gradesReleasedAt,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Overwrites a test's visibility flags and stamps audit fields.
   * Does NOT touch `gradesReleasedAt` or `correctAnswersReleasedAt` — those are
   * owned by the dedicated release mutators (`releaseGrades`, `releaseCorrectAnswers`).
   */
  async updateTestSettings(
    testId: string,
    input: UpdateTestSettingsInput,
  ): Promise<void> {
    if (input.isPractice && input.timeLimitMinutes != null) {
      throw new Error("A practice test cannot have a time limit.");
    }

    await this.tests.updateOne(
      { id: testId },
      {
        $set: {
          showGradeAfterSubmit: input.showGradeAfterSubmit,
          showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit,
          timeLimitMinutes: input.timeLimitMinutes,
          isPractice: input.isPractice,
          updatedAt: new Date(),
          updatedBy: input.updatedBy,
        },
      },
    );
  }

  async releaseGrades(testId: string, updatedBy: string): Promise<void> {
    await this.tests.updateOne(
      { id: testId },
      {
        $set: {
          gradesReleasedAt: new Date(),
          updatedBy,
          updatedAt: new Date(),
        },
      },
    );
  }

  async releaseCorrectAnswers(
    testId: string,
    updatedBy: string,
  ): Promise<void> {
    await this.tests.updateOne(
      { id: testId },
      {
        $set: {
          correctAnswersReleasedAt: new Date(),
          updatedBy,
          updatedAt: new Date(),
        },
      },
    );
  }

  async deleteTest(testId: string, deletedBy: string): Promise<void> {
    await this.tests.updateOne(
      { id: testId },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy,
          updatedAt: new Date(),
          updatedBy: deletedBy,
        },
      },
    );
  }
}
