import type { Collection, Db } from "mongodb";

/**
 * Answer document stored in the `answer` collection.
 * Append-only: edits create a new record, never update existing ones.
 */
export interface AnswerDocument {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  answer: string;
  submittedAt: Date;
}

/**
 * Client-facing answer interface.
 */
export interface Answer {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  answer: string;
  submittedAt: Date;
}

/**
 * Input for submitting an answer.
 */
export interface SubmitAnswerInput {
  testId: string;
  questionId: string;
  studentId: string;
  answer: string;
}

/**
 * AnswerService — manages the `answer` collection.
 * Append-only model: every submission creates a new document.
 * Edits insert on top of previous answers, preserving history.
 */
export class AnswerService {
  private readonly answers: Collection<AnswerDocument>;

  constructor(db: Db) {
    this.answers = db.collection<AnswerDocument>("answer");
  }

  /**
   * Submits an answer for a question. Always creates a new record.
   */
  async submitAnswer(input: SubmitAnswerInput): Promise<Answer> {
    // Check if the latest answer is the same — skip insert if unchanged
    const latest = await this.answers
      .find({
        testId: input.testId,
        questionId: input.questionId,
        studentId: input.studentId,
      })
      .sort({ submittedAt: -1 })
      .limit(1)
      .toArray();

    if (latest.length > 0 && latest[0].answer === input.answer) {
      throw new Error("Answer is unchanged");
    }

    const doc: AnswerDocument = {
      id: crypto.randomUUID(),
      testId: input.testId,
      questionId: input.questionId,
      studentId: input.studentId,
      answer: input.answer,
      submittedAt: new Date(),
    };

    await this.answers.insertOne(doc);

    return this.toAnswer(doc);
  }

  /**
   * Returns the most recent answer for each question in a test,
   * for a specific student. Uses aggregation to group by questionId
   * and pick the latest submittedAt.
   */
  async getLatestAnswers(
    testId: string,
    studentId: string,
  ): Promise<Answer[]> {
    const pipeline = [
      { $match: { testId, studentId } },
      { $sort: { submittedAt: -1 as const } },
      {
        $group: {
          _id: "$questionId",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
    ];

    const docs = await this.answers
      .aggregate<AnswerDocument>(pipeline)
      .toArray();

    return docs.map(this.toAnswer);
  }

  private toAnswer(doc: AnswerDocument): Answer {
    return {
      id: doc.id,
      testId: doc.testId,
      questionId: doc.questionId,
      studentId: doc.studentId,
      answer: doc.answer,
      submittedAt: doc.submittedAt,
    };
  }
}
