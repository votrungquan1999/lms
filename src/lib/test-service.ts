import type { Collection, Db } from "mongodb";

/**
 * Test document stored in the `test` collection.
 */
export interface TestDocument {
  id: string;
  courseId: string;
  title: string;
  description: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Client-facing test interface.
 */
export interface Test {
  id: string;
  courseId: string;
  title: string;
  description: string;
  createdAt: Date;
}

/**
 * Input for creating a new test.
 */
export interface CreateTestInput {
  title: string;
  description: string;
  createdBy: string;
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
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
    };

    await this.tests.insertOne(doc);

    return {
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    };
  }

  async getTest(testId: string): Promise<Test | null> {
    const doc = await this.tests.findOne({ id: testId });
    if (!doc) {
      return null;
    }
    return {
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    };
  }

  async listTests(courseId: string): Promise<Test[]> {
    const docs = await this.tests
      .find({ courseId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => ({
      id: doc.id,
      courseId: doc.courseId,
      title: doc.title,
      description: doc.description,
      createdAt: doc.createdAt,
    }));
  }
}
