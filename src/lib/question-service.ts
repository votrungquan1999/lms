import type { Collection, Db } from "mongodb";
import {
  type ComposePoolSelection,
  type PoolQuestionSnapshotInput,
  type QuestionSampler,
  shuffleAndTake,
} from "src/lib/question-compose";

export type QuestionType =
  | "free_text"
  | "single_select"
  | "multi_select"
  | "image_answer";
export type McGradingStrategy = "all_or_nothing" | "partial";

/** Allowed MIME types for question media attachments. */
export enum MediaContentType {
  PNG = "image/png",
  JPEG = "image/jpeg",
  WEBP = "image/webp",
  MP4 = "video/mp4",
}

export interface McOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

/** A media attachment as stored on the question document (the S3 key, never a URL). */
export interface QuestionMediaDocument {
  key: string;
  contentType: MediaContentType;
  order: number;
  size: number;
  fileName: string;
}

/** Client-facing media attachment; `url` is filled by the render-layer helper (empty until then). */
export interface QuestionMedia {
  key: string;
  url: string;
  contentType: MediaContentType;
  order: number;
}

/** Ordered media attachment supplied when creating a question (keys already uploaded to S3). */
export interface QuestionMediaInput {
  key: string;
  contentType: MediaContentType;
  order: number;
  size: number;
  fileName: string;
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
  /** Ordered media attachments (empty when none). */
  media: QuestionMedia[];
}

export interface FreeTextQuestion extends BaseQuestion {
  type: "free_text";
  /** Authored model answer, surfaced to the student in practice-mode reveal. */
  referenceAnswer?: string;
  /** Optional teacher note shown to the student once the answer is revealed. */
  explanation?: string;
}

/**
 * A question answered by uploading photo(s) of handwritten work — the student
 * submits images instead of typing. Has no options (graded manually).
 */
export interface ImageAnswerQuestion extends BaseQuestion {
  type: "image_answer";
}

export interface SingleSelectQuestion extends BaseQuestion {
  type: "single_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
  /** Optional teacher note shown to the student once correct answers are revealed. */
  explanation?: string;
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: "multi_select";
  options: McOption[];
  mcGradingStrategy: McGradingStrategy;
  /** Optional teacher note shown to the student once correct answers are revealed. */
  explanation?: string;
}

export type Question =
  | FreeTextQuestion
  | SingleSelectQuestion
  | MultiSelectQuestion
  | ImageAnswerQuestion;

/**
 * True for the auto-graded multiple-choice question types (`single_select` /
 * `multi_select`). Single source of truth for "is this MC?" — use this instead
 * of repeating the `type === "single_select" || type === "multi_select"` check.
 * A type predicate so callers narrowing a discriminated union keep that narrowing.
 */
export function isMcQuestionType(
  type: QuestionType,
): type is "single_select" | "multi_select" {
  return type === "single_select" || type === "multi_select";
}

/**
 * Type-guard variant of {@link isMcQuestionType}: narrows a `Question` to its
 * MC union so `.options` / `.explanation` are accessible without a manual cast.
 */
export function isMcQuestion(
  question: Question,
): question is SingleSelectQuestion | MultiSelectQuestion {
  return isMcQuestionType(question.type);
}

// ── Input types ──────────────────────────────────────────────────────────────

interface BaseAddQuestionInput {
  title: string;
  content: string;
  createdBy: string;
  weight?: number;
  /** Ordered media attachments already uploaded to S3 (keys, not URLs). */
  media?: QuestionMediaInput[];
}

export interface AddFreeTextQuestionInput extends BaseAddQuestionInput {
  type?: "free_text";
  referenceAnswer?: string;
  explanation?: string;
}

export interface AddImageAnswerQuestionInput extends BaseAddQuestionInput {
  type: "image_answer";
}

export interface AddSingleSelectQuestionInput extends BaseAddQuestionInput {
  type: "single_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy?: McGradingStrategy;
  explanation?: string;
}

export interface AddMultiSelectQuestionInput extends BaseAddQuestionInput {
  type: "multi_select";
  options: Omit<McOption, "id">[];
  mcGradingStrategy: McGradingStrategy;
  explanation?: string;
}

export type AddQuestionInput =
  | AddFreeTextQuestionInput
  | AddSingleSelectQuestionInput
  | AddMultiSelectQuestionInput
  | AddImageAnswerQuestionInput;

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
  /** Optional teacher note shown to the student once the answer is revealed (MC or free_text). */
  explanation: string | null;
  /** Authored model answer for a free_text question, surfaced in practice-mode reveal. */
  referenceAnswer: string | null;
  /** Ordered media attachments (empty when none). */
  media: QuestionMediaDocument[];
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
    input: AddImageAnswerQuestionInput,
  ): Promise<ImageAnswerQuestion>;
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
      explanation: "explanation" in input ? (input.explanation ?? null) : null,
      referenceAnswer:
        "referenceAnswer" in input ? (input.referenceAnswer ?? null) : null,
      media: input.media ?? [],
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
      explanation: null,
      referenceAnswer: null,
      media: [],
    }));

    await this.questions.insertMany(docs);

    return docs.map(this.toQuestion);
  }

  /**
   * Composes a test from pool selections by snapshotting the chosen pool
   * questions into this test's own `question` collection. Each selection draws
   * `count` questions from its pool's pre-fetched list (via `sampler`). Copies
   * are frozen at this moment — fresh ids, fresh option ids, the composing
   * admin as `createdBy`, media keys shared read-only, no live backlink to the
   * pool. New questions are appended after any existing test questions.
   *
   * @param testId - The test to compose into.
   * @param selections - Per-pool question lists and draw counts.
   * @param createdBy - The composing admin's id.
   * @param sampler - Selection strategy; defaults to Fisher-Yates shuffle+take.
   * @returns The composed questions in their stored order.
   */
  async composeFromPools(
    testId: string,
    selections: ComposePoolSelection[],
    createdBy: string,
    sampler: QuestionSampler = shuffleAndTake,
  ): Promise<Question[]> {
    const drawn: PoolQuestionSnapshotInput[] = selections.flatMap((selection) =>
      sampler(selection.questions, selection.count),
    );

    if (drawn.length === 0) {
      return [];
    }

    const startOrder = await this.getNextOrder(testId);

    const docs: QuestionDocument[] = drawn.map((item, index) => ({
      id: crypto.randomUUID(),
      testId,
      title: item.title,
      content: item.content,
      order: startOrder + index,
      createdAt: new Date(),
      createdBy,
      updatedAt: null,
      updatedBy: null,
      type: item.type,
      // Regenerate option ids so the copy shares no references with the pool.
      options:
        item.options != null
          ? item.options.map((o) => ({ ...o, id: crypto.randomUUID() }))
          : null,
      weight: item.weight,
      mcGradingStrategy: item.mcGradingStrategy,
      explanation: item.explanation,
      referenceAnswer: item.referenceAnswer,
      // Media keys are copied verbatim — shared S3 objects, read-only.
      media: item.media.map((m) => ({ ...m })),
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

  /**
   * Maps a stored question document to the client-facing discriminated union.
   * Media is mapped with an empty `url` placeholder — the render-layer helper
   * mints the presigned URL. Stays `this`-free so it can be used as a bare
   * `docs.map(this.toQuestion)` callback.
   * @param doc - The stored question document.
   * @returns The client-facing question.
   */
  private toQuestion(doc: QuestionDocument): Question {
    const base: BaseQuestion = {
      id: doc.id,
      testId: doc.testId,
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
      } satisfies SingleSelectQuestion;
    }

    if (type === "multi_select" && doc.options != null) {
      return {
        ...base,
        type: "multi_select",
        options: doc.options,
        mcGradingStrategy: doc.mcGradingStrategy ?? "all_or_nothing",
        explanation: doc.explanation ?? undefined,
      } satisfies MultiSelectQuestion;
    }

    if (type === "image_answer") {
      return { ...base, type: "image_answer" } satisfies ImageAnswerQuestion;
    }

    return {
      ...base,
      type: "free_text",
      referenceAnswer: doc.referenceAnswer ?? undefined,
      explanation: doc.explanation ?? undefined,
    } satisfies FreeTextQuestion;
  }
}
