import type { Collection, Db } from "mongodb";

export type QuestionType = "free_text" | "single_select" | "multi_select";
export type McGradingStrategy = "all_or_nothing" | "partial";

export interface McOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

// ── Discriminated union for the client-facing Question type ──────────────────

interface BaseQuestion {
  id: string;
  testId: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  /** Scoring weight for weighted average (default 1). */
  weight: number;
}

export interface FreeTextQuestion extends BaseQuestion {
  type: "free_text";
}

export interface SingleSelectQuestion extends BaseQuestion {
  type: "single_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: "multi_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
}

export type Question =
  | FreeTextQuestion
  | SingleSelectQuestion
  | MultiSelectQuestion;

// ── Input types ──────────────────────────────────────────────────────────────

interface BaseAddQuestionInput {
  title: string;
  content: string;
  createdBy: string;
  weight?: number;
}

export interface AddFreeTextQuestionInput extends BaseAddQuestionInput {
  type?: "free_text";
}

export interface AddSingleSelectQuestionInput extends BaseAddQuestionInput {
  type: "single_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy?: McGradingStrategy;
}

export interface AddMultiSelectQuestionInput extends BaseAddQuestionInput {
  type: "multi_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy: McGradingStrategy;
}

export type AddQuestionInput =
  | AddFreeTextQuestionInput
  | AddSingleSelectQuestionInput
  | AddMultiSelectQuestionInput;

// ── Document (flat, for MongoDB storage) ────────────────────────────────────

/**
 * Question document stored in the `question` collection.
 * Stored flat for simplicity; mapped to the discriminated union at read time.
 */
export interface QuestionDocument {
  id: string;
  testId: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  type: QuestionType;
  options: McOption[] | null;
  weight: number;
  mcGradingStrategy: McGradingStrategy | null;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class QuestionService {
  private readonly questions: Collection<QuestionDocument>;

  constructor(db: Db) {
    this.questions = db.collection<QuestionDocument>("question");
  }

  async addQuestion(
    testId: string,
    input: AddSingleSelectQuestionInput,
  ): Promise<SingleSelectQuestion>;
  async addQuestion(
    testId: string,
    input: AddMultiSelectQuestionInput,
  ): Promise<MultiSelectQuestion>;
  async addQuestion(
    testId: string,
    input: AddFreeTextQuestionInput,
  ): Promise<FreeTextQuestion>;
  async addQuestion(
    testId: string,
    input: AddQuestionInput,
  ): Promise<Question> {
    const nextOrder = await this.getNextOrder(testId);

    const type: QuestionType = input.type ?? "free_text";
    const options: McOption[] | null =
      "options" in input && input.options != null
        ? input.options.map((o) => ({ ...o, id: crypto.randomUUID() }))
        : null;

    this.validateMcOptions(type, options);

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
      type,
      options,
      weight: input.weight ?? 1,
      mcGradingStrategy:
        "mcGradingStrategy" in input ? (input.mcGradingStrategy ?? null) : null,
    };

    await this.questions.insertOne(doc);

    return this.toQuestion(doc);
  }

  /**
   * Validates that MC options satisfy the rule for their question type.
   * - single_select: exactly one correct option
   * - multi_select: at least one correct option
   * No-op for free_text questions.
   */
  private validateMcOptions(
    type: QuestionType,
    options: McOption[] | null,
  ): void {
    if (type === "single_select") {
      const correctCount = options?.filter((o) => o.isCorrect).length ?? 0;
      if (correctCount !== 1) {
        throw new Error(
          "single_select question must have exactly one correct option",
        );
      }
    }

    if (type === "multi_select") {
      const correctCount = options?.filter((o) => o.isCorrect).length ?? 0;
      if (correctCount === 0) {
        throw new Error(
          "multi_select question must have at least one correct option",
        );
      }
    }
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
      type: "free_text" as const,
      options: null,
      weight: 1,
      mcGradingStrategy: null,
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
    const base: BaseQuestion = {
      id: doc.id,
      testId: doc.testId,
      title: doc.title,
      content: doc.content,
      order: doc.order,
      createdAt: doc.createdAt,
      weight: doc.weight ?? 1,
    };

    const type: QuestionType = doc.type ?? "free_text";

    if (type === "single_select" && doc.options != null) {
      return {
        ...base,
        type: "single_select",
        options: doc.options,
        mcGradingStrategy: doc.mcGradingStrategy ?? "all_or_nothing",
      } satisfies SingleSelectQuestion;
    }

    if (type === "multi_select" && doc.options != null) {
      return {
        ...base,
        type: "multi_select",
        options: doc.options,
        mcGradingStrategy: doc.mcGradingStrategy ?? "all_or_nothing",
      } satisfies MultiSelectQuestion;
    }

    return { ...base, type: "free_text" } satisfies FreeTextQuestion;
  }
}
