import type { Collection, Db } from "mongodb";
import type { PoolQuestionSnapshotInput } from "src/lib/question-compose";
import type {
  McGradingStrategy,
  McOption,
  QuestionMedia,
  QuestionMediaDocument,
  QuestionMediaInput,
  QuestionType,
} from "src/lib/question-service";

// ── Client-facing discriminated union for a pool question ────────────────────

interface BasePoolQuestion {
  id: string;
  poolId: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  /** Scoring weight for weighted average (default 1). */
  weight: number;
  /** Ordered media attachments (empty when none). */
  media: QuestionMedia[];
}

export interface PoolFreeTextQuestion extends BasePoolQuestion {
  type: "free_text";
}

export interface PoolSingleSelectQuestion extends BasePoolQuestion {
  type: "single_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
  /** Optional teacher note shown to the student once correct answers are revealed. */
  explanation?: string;
}

export interface PoolMultiSelectQuestion extends BasePoolQuestion {
  type: "multi_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
  /** Optional teacher note shown to the student once correct answers are revealed. */
  explanation?: string;
}

export type PoolQuestion =
  | PoolFreeTextQuestion
  | PoolSingleSelectQuestion
  | PoolMultiSelectQuestion;

// ── Input types (parallel to AddQuestionInput, with poolId scoping) ──────────

interface BaseAddPoolQuestionInput {
  title: string;
  content: string;
  createdBy: string;
  weight?: number;
  /** Ordered media attachments already uploaded to S3 (keys, not URLs). */
  media?: QuestionMediaInput[];
}

export interface AddPoolFreeTextQuestionInput extends BaseAddPoolQuestionInput {
  type?: "free_text";
}

export interface AddPoolSingleSelectQuestionInput
  extends BaseAddPoolQuestionInput {
  type: "single_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy?: McGradingStrategy;
  explanation?: string;
}

export interface AddPoolMultiSelectQuestionInput
  extends BaseAddPoolQuestionInput {
  type: "multi_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy: McGradingStrategy;
  explanation?: string;
}

export type AddPoolQuestionInput =
  | AddPoolFreeTextQuestionInput
  | AddPoolSingleSelectQuestionInput
  | AddPoolMultiSelectQuestionInput;

// ── Document (flat, for MongoDB storage) ─────────────────────────────────────

/**
 * Pool question document stored in the `pool_question` collection.
 * Mirrors `QuestionDocument` but scoped to a pool (`poolId`) rather than a test.
 */
export interface PoolQuestionDocument {
  id: string;
  poolId: string;
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
  /** Optional teacher note shown to the student once correct answers are revealed (MC only). */
  explanation: string | null;
  media: QuestionMediaDocument[];
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * PoolQuestionService — manages the `pool_question` collection. Mirrors
 * `QuestionService` substituting `poolId` for `testId`. Pool questions are the
 * canonical authoring source; tests snapshot copies of them at composition.
 */
export class PoolQuestionService {
  private readonly questions: Collection<PoolQuestionDocument>;

  constructor(db: Db) {
    this.questions = db.collection<PoolQuestionDocument>("pool_question");
  }

  async addPoolQuestion(
    poolId: string,
    input: AddPoolSingleSelectQuestionInput,
  ): Promise<PoolSingleSelectQuestion>;
  async addPoolQuestion(
    poolId: string,
    input: AddPoolMultiSelectQuestionInput,
  ): Promise<PoolMultiSelectQuestion>;
  async addPoolQuestion(
    poolId: string,
    input: AddPoolFreeTextQuestionInput,
  ): Promise<PoolFreeTextQuestion>;
  async addPoolQuestion(
    poolId: string,
    input: AddPoolQuestionInput,
  ): Promise<PoolQuestion> {
    const nextOrder = await this.getNextOrder(poolId);

    const type: QuestionType = input.type ?? "free_text";
    const options: McOption[] | null =
      "options" in input && input.options != null
        ? input.options.map((o) => ({ ...o, id: crypto.randomUUID() }))
        : null;

    this.validateMcOptions(type, options);

    const doc: PoolQuestionDocument = {
      id: crypto.randomUUID(),
      poolId,
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
      explanation: "explanation" in input ? (input.explanation ?? null) : null,
      media: input.media ?? [],
    };

    await this.questions.insertOne(doc);

    return this.toPoolQuestion(doc);
  }

  /**
   * Returns every question in a pool, ordered by `order` ascending.
   */
  async listPoolQuestions(poolId: string): Promise<PoolQuestion[]> {
    const docs = await this.questions
      .find({ poolId })
      .sort({ order: 1 })
      .toArray();

    return docs.map((doc) => this.toPoolQuestion(doc));
  }

  /**
   * Returns a pool's questions projected as compose snapshot inputs — the full
   * field set (including media `size`/`fileName`, which the client `PoolQuestion`
   * type omits) that `QuestionService.composeFromPools` consumes to snapshot
   * copies into a test.
   */
  async listSnapshotInputs(
    poolId: string,
  ): Promise<PoolQuestionSnapshotInput[]> {
    const docs = await this.questions
      .find({ poolId })
      .sort({ order: 1 })
      .toArray();

    return docs.map((doc) => ({
      title: doc.title,
      content: doc.content,
      type: doc.type ?? "free_text",
      options: doc.options,
      weight: doc.weight ?? 1,
      mcGradingStrategy: doc.mcGradingStrategy,
      explanation: doc.explanation,
      media: (doc.media ?? []).map((m) => ({
        key: m.key,
        contentType: m.contentType,
        order: m.order,
        size: m.size,
        fileName: m.fileName,
      })),
    }));
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

  private async getNextOrder(poolId: string): Promise<number> {
    const last = await this.questions
      .find({ poolId })
      .sort({ order: -1 })
      .limit(1)
      .toArray();

    return last.length > 0 ? last[0].order + 1 : 1;
  }

  /**
   * Maps a stored pool question document to the client-facing discriminated
   * union. Media is mapped with an empty `url` placeholder (minted later by the
   * render layer). Stays `this`-free for use as a bare `.map` callback.
   */
  private toPoolQuestion(doc: PoolQuestionDocument): PoolQuestion {
    const base: BasePoolQuestion = {
      id: doc.id,
      poolId: doc.poolId,
      title: doc.title,
      content: doc.content,
      order: doc.order,
      createdAt: doc.createdAt,
      weight: doc.weight ?? 1,
      media: (doc.media ?? []).map((m) => ({
        key: m.key,
        url: "",
        contentType: m.contentType,
        order: m.order,
      })),
    };

    const type: QuestionType = doc.type ?? "free_text";

    if (type === "single_select" && doc.options != null) {
      return {
        ...base,
        type: "single_select",
        options: doc.options,
        mcGradingStrategy: doc.mcGradingStrategy ?? "all_or_nothing",
        explanation: doc.explanation ?? undefined,
      } satisfies PoolSingleSelectQuestion;
    }

    if (type === "multi_select" && doc.options != null) {
      return {
        ...base,
        type: "multi_select",
        options: doc.options,
        mcGradingStrategy: doc.mcGradingStrategy ?? "all_or_nothing",
        explanation: doc.explanation ?? undefined,
      } satisfies PoolMultiSelectQuestion;
    }

    return { ...base, type: "free_text" } satisfies PoolFreeTextQuestion;
  }
}
