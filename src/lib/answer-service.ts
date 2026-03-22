import type { Collection, Db } from "mongodb";
import type { QuestionService } from "./question-service";

// ── Discriminated union for student answers ──────────────────────────────────

export type StudentAnswer =
  | { type: "free_text"; text: string }
  | { type: "mc"; selectedIds: string[] };

/**
 * Answer document stored in the `answer` collection.
 * Append-only: edits create a new record, never update existing ones.
 */
export interface AnswerDocument {
  id: string;
  testId: string;
  questionId: string;
  studentId: string;
  answer: StudentAnswer;
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
  answer: StudentAnswer;
  submittedAt: Date;
}

/**
 * Input for submitting an answer.
 */
export interface SubmitAnswerInput {
  testId: string;
  questionId: string;
  studentId: string;
  answer: StudentAnswer;
}

/**
 * AnswerService — manages the `answer` collection.
 * Append-only model: every submission creates a new document.
 */
export class AnswerService {
  private readonly answers: Collection<AnswerDocument>;
  private readonly questionService: QuestionService;

  constructor(db: Db, questionService: QuestionService) {
    this.answers = db.collection<AnswerDocument>("answer");
    this.questionService = questionService;
  }

  /**
   * Submits an answer for a question. Always creates a new record.
   * Throws if:
   * - The answer is identical to the latest submission.
   * - An MC answer has no selected options.
   * - An MC answer references option IDs that don't exist on the question.
   */
  async submitAnswer(input: SubmitAnswerInput): Promise<Answer> {
    // Validate MC answers against the question's actual options
    if (input.answer.type === "mc") {
      const { selectedIds } = input.answer;

      if (selectedIds.length === 0) {
        throw new Error(
          "MC answer must have at least one selected option. To leave a question unanswered, do not submit an answer for it.",
        );
      }

      const question = await this.questionService
        .listQuestions(input.testId)
        .then((qs) => qs.find((q) => q.id === input.questionId));

      if (!question || question.type === "free_text") {
        throw new Error("Question not found or is not an MC question");
      }

      const validIds = new Set(question.options.map((o) => o.id));
      const bogusIds = selectedIds.filter((id) => !validIds.has(id));
      if (bogusIds.length > 0) {
        throw new Error(
          `MC answer contains invalid option IDs: ${bogusIds.join(", ")}`,
        );
      }
    }

    const latest = await this.answers
      .find({
        testId: input.testId,
        questionId: input.questionId,
        studentId: input.studentId,
      })
      .sort({ submittedAt: -1 })
      .limit(1)
      .toArray();

    if (
      latest.length > 0 &&
      JSON.stringify(latest[0].answer) === JSON.stringify(input.answer)
    ) {
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
   * for a specific student.
   */
  async getLatestAnswers(testId: string, studentId: string): Promise<Answer[]> {
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
