import type { Collection, Db } from "mongodb";

/**
 * Question document stored in the `question` collection.
 */
export interface QuestionDocument {
  id: string;
  testId: string;
  title: string;
  /** Raw markdown content. */
  content: string;
  order: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/**
 * Client-facing question interface.
 */
export interface Question {
  id: string;
  testId: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
}

/**
 * Input for adding a single question.
 */
export interface AddQuestionInput {
  title: string;
  content: string;
  createdBy: string;
}

/**
 * QuestionService — manages the `question` collection.
 */
export class QuestionService {
  private readonly questions: Collection<QuestionDocument>;

  constructor(db: Db) {
    this.questions = db.collection<QuestionDocument>("question");
  }

  async addQuestion(
    testId: string,
    input: AddQuestionInput,
  ): Promise<Question> {
    const nextOrder = await this.getNextOrder(testId);

    const doc: QuestionDocument = {
      id: crypto.randomUUID(),
      testId,
      title: input.title,
      content: input.content,
      order: nextOrder,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
    };

    await this.questions.insertOne(doc);

    return this.toQuestion(doc);
  }

  async importQuestions(
    testId: string,
    questions: { title: string; content: string }[],
    createdBy: string,
  ): Promise<Question[]> {
    if (questions.length === 0) {
      return [];
    }

    const startOrder = await this.getNextOrder(testId);

    const docs: QuestionDocument[] = questions.map((q, index) => ({
      id: crypto.randomUUID(),
      testId,
      title: q.title,
      content: q.content,
      order: startOrder + index,
      createdAt: new Date(),
      createdBy,
      updatedAt: null,
      updatedBy: null,
    }));

    await this.questions.insertMany(docs);

    return docs.map(this.toQuestion);
  }

  async listQuestions(testId: string): Promise<Question[]> {
    const docs = await this.questions
      .find({ testId })
      .sort({ order: 1 })
      .toArray();

    return docs.map(this.toQuestion);
  }

  /**
   * Batch-fetches question counts for multiple test IDs in a single aggregate.
   * Used as the batch function for DataLoader — callers should prefer the
   * DataLoader rather than calling this directly.
   */
  async countByTestIds(testIds: string[]): Promise<Map<string, number>> {
    if (testIds.length === 0) {
      return new Map();
    }

    const pipeline = [
      { $match: { testId: { $in: testIds } } },
      { $group: { _id: "$testId", count: { $sum: 1 } } },
    ];

    const results = await this.questions
      .aggregate<{ _id: string; count: number }>(pipeline)
      .toArray();

    const counts = new Map<string, number>();
    for (const r of results) {
      counts.set(r._id, r.count);
    }
    return counts;
  }

  private async getNextOrder(testId: string): Promise<number> {
    const last = await this.questions
      .find({ testId })
      .sort({ order: -1 })
      .limit(1)
      .toArray();

    return last.length > 0 ? last[0].order + 1 : 1;
  }

  private toQuestion(doc: QuestionDocument): Question {
    return {
      id: doc.id,
      testId: doc.testId,
      title: doc.title,
      content: doc.content,
      order: doc.order,
      createdAt: doc.createdAt,
    };
  }
}
