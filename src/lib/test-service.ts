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
    const doc: TestDocument = {
      id: crypto.randomUUID(),
      courseId,
      title: input.title,
      description: input.description,
      showCorrectAnswerAfterSubmit: input.showCorrectAnswerAfterSubmit ?? true,
      showGradeAfterSubmit: input.showGradeAfterSubmit ?? true,
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

  private toTest(doc: TestDocument): Test {
    return {
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      showCorrectAnswerAfterSubmit: doc.showCorrectAnswerAfterSubmit,
      showGradeAfterSubmit: doc.showGradeAfterSubmit,
      correctAnswersReleasedAt: doc.correctAnswersReleasedAt,
      gradesReleasedAt: doc.gradesReleasedAt,
      createdAt: doc.createdAt,
    };
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
