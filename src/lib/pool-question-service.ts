import type { Collection, Db } from "mongodb";
import type { QuestionChangeLogService } from "src/lib/question-change-log-service";
import type { PoolQuestionSnapshotInput } from "src/lib/question-compose";
import {
  isMcQuestionType,
  type McGradingStrategy,
  type McOption,
  type QuestionMedia,
  type QuestionMediaDocument,
  type QuestionMediaInput,
  type QuestionType,
} from "src/lib/question-service";
import type { AnswerRevealMode } from "src/lib/test-service";

/**
 * Value equality for change-log diffing — mirrors `question-service.ts`'s own
 * `valuesEqual` (D30: a parallel implementation, not a shared one). `options`
 * is an array of plain objects, so `!==` would fire on every save.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => valuesEqual(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      valuesEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
}

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
  /** Authored model answer, surfaced to the student in practice-mode reveal. */
  referenceAnswer?: string;
  /** Optional teacher note shown to the student once the answer is revealed. */
  explanation?: string;
  /** Overrides the test's answerRevealMode once composed; absent means inherit the test. */
  answerRevealMode?: AnswerRevealMode;
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
  referenceAnswer?: string;
  explanation?: string;
  /** Overrides the test's answerRevealMode once composed; absent means inherit the test. */
  answerRevealMode?: AnswerRevealMode;
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
  /** Optional teacher note shown to the student once the answer is revealed (MC or free_text). */
  explanation: string | null;
  /** Authored model answer for a free_text question, surfaced in practice-mode reveal. */
  referenceAnswer: string | null;
  /** Per-question override of the test's answerRevealMode once composed; null means inherit. */
  answerRevealMode: AnswerRevealMode | null;
  media: QuestionMediaDocument[];
  /** Soft-delete marker (D51) — non-null means this pool question is a tombstone. */
  deletedAt: Date | null;
  deletedBy: string | null;
}

/**
 * Input for correcting a pool question a teacher already wrote. Mirrors
 * `QuestionService.UpdateQuestionInput` (D30: a parallel path, not a shared
 * one) — a field's absence means "leave unchanged"; `null` on the nullable
 * fields means "clear".
 */
export interface UpdatePoolQuestionInput {
  answerRevealMode?: AnswerRevealMode | null;
  referenceAnswer?: string | null;
  explanation?: string | null;
  title?: string;
  content?: string;
  options?: { id?: string; text: string; isCorrect: boolean }[];
  type?: QuestionType;
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * PoolQuestionService — manages the `pool_question` collection. Mirrors
 * `QuestionService` substituting `poolId` for `testId`. Pool questions are the
 * canonical authoring source; tests snapshot copies of them at composition.
 */
export class PoolQuestionService {
  private readonly questions: Collection<PoolQuestionDocument>;

  /**
   * `changeLogService` is optional so every existing direct
   * `new PoolQuestionService(db)` call site keeps compiling and logs nothing
   * (mirrors `QuestionService`'s own optional constructor param). No
   * `getAnswerService` thunk exists here — pool questions carry no student
   * answers (D51), so there is no answered-student count to fetch.
   */
  constructor(
    db: Db,
    private readonly changeLogService?: QuestionChangeLogService,
  ) {
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
      referenceAnswer:
        "referenceAnswer" in input ? (input.referenceAnswer ?? null) : null,
      answerRevealMode:
        "answerRevealMode" in input ? (input.answerRevealMode ?? null) : null,
      media: input.media ?? [],
      deletedAt: null,
      deletedBy: null,
    };

    await this.questions.insertOne(doc);

    return this.toPoolQuestion(doc);
  }

  /**
   * Returns every question in a pool, ordered by `order` ascending.
   * Excludes tombstones (D51/D47).
   */
  async listPoolQuestions(poolId: string): Promise<PoolQuestion[]> {
    const docs = await this.questions
      .find({ poolId, deletedAt: null })
      .sort({ order: 1 })
      .toArray();

    return docs.map((doc) => this.toPoolQuestion(doc));
  }

  /**
   * Returns a pool's questions projected as compose snapshot inputs — the full
   * field set (including media `size`/`fileName`, which the client `PoolQuestion`
   * type omits) that `QuestionService.composeFromPools` consumes to snapshot
   * copies into a test. Excludes tombstones (D51) — the second read funnel a
   * missed filter here would let a deleted pool question keep being composed
   * into new tests.
   */
  async listSnapshotInputs(
    poolId: string,
  ): Promise<PoolQuestionSnapshotInput[]> {
    const docs = await this.questions
      .find({ poolId, deletedAt: null })
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
      referenceAnswer: doc.referenceAnswer,
      answerRevealMode: doc.answerRevealMode,
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
    // Excludes tombstones (D47/D51), mirroring QuestionService's own
    // getNextOrder — a live question can end up sharing an order number
    // with an earlier tombstone; restoring a delete is not supported.
    const last = await this.questions
      .find({ poolId, deletedAt: null })
      .sort({ order: -1 })
      .limit(1)
      .toArray();

    return last.length > 0 ? last[0].order + 1 : 1;
  }

  /**
   * Corrects fields on a pool question a teacher already wrote (D30 — a
   * parallel path to `QuestionService.updateQuestion`, not a shared one).
   * Pool questions carry no student answers, so no modal/answer-count call
   * is needed here (D51) — the change log still records the edit, with
   * `poolId` set and `testId` null.
   * @param poolQuestionId - The pool question to update.
   * @param input - The fields to change.
   * @param updatedBy - The admin making the change.
   */
  async updatePoolQuestion(
    poolQuestionId: string,
    input: UpdatePoolQuestionInput,
    updatedBy: string,
  ): Promise<void> {
    const before = await this.questions.findOne({ id: poolQuestionId });

    const set: Partial<PoolQuestionDocument> = {
      updatedAt: new Date(),
      updatedBy,
    };
    if ("answerRevealMode" in input) {
      set.answerRevealMode = input.answerRevealMode ?? null;
    }
    if ("referenceAnswer" in input) {
      set.referenceAnswer = input.referenceAnswer ?? null;
    }
    if ("explanation" in input) {
      set.explanation = input.explanation ?? null;
    }
    if ("title" in input && input.title !== undefined) {
      set.title = input.title;
    }
    if ("content" in input && input.content !== undefined) {
      set.content = input.content;
    }

    const optionsProvided = "options" in input && input.options !== undefined;
    const typeChanging =
      "type" in input &&
      input.type !== undefined &&
      input.type !== before?.type;
    const resolvedType: QuestionType = typeChanging
      ? (input.type as QuestionType)
      : (before?.type ?? "free_text");

    if (typeChanging) {
      set.type = resolvedType;
      // D54: the document always agrees with its type — clear fields the
      // new type cannot hold. A same save that also supplies options for
      // the new type overwrites this below; harmless in the meantime.
      if (!isMcQuestionType(resolvedType)) {
        set.options = null;
        set.mcGradingStrategy = null;
      }
      if (resolvedType !== "free_text") {
        set.referenceAnswer = null;
        set.answerRevealMode = null;
      }
      if (resolvedType === "image_answer") {
        set.explanation = null;
      }
    }

    if (optionsProvided || typeChanging) {
      // D53: keep the id the caller supplied; mint a fresh one only for a
      // genuinely new option. Re-runs the MC rule the same way addPoolQuestion
      // does on create — skipped entirely when neither field is touched, so
      // an existing question is never re-validated by an unrelated edit.
      const resolvedOptions: McOption[] | null = optionsProvided
        ? (
            input.options as { id?: string; text: string; isCorrect: boolean }[]
          ).map((o) => ({
            id: o.id ?? crypto.randomUUID(),
            text: o.text,
            isCorrect: o.isCorrect,
          }))
        : isMcQuestionType(resolvedType)
          ? (before?.options ?? null)
          : null;
      this.validateMcOptions(resolvedType, resolvedOptions);
      // D54: the type governs what's stored, not whether the caller
      // supplied an options array — a free_text save that carries options
      // never persists them (closes the loophole where the two fields
      // disagree about what the document is).
      if (optionsProvided) {
        set.options = isMcQuestionType(resolvedType) ? resolvedOptions : null;
      }
    }

    await this.questions.updateOne({ id: poolQuestionId }, { $set: set });

    if (before) {
      await this.logRealChanges(before, set, updatedBy);
    }
  }

  /**
   * Soft-deletes a pool question (D37/D51). Pool questions carry no student
   * answers, so this is the safest possible delete — no modal, no
   * answer-count call. Records its own change-log row carrying the whole
   * question as `before`.
   * @param poolQuestionId - The pool question to delete.
   * @param deletedBy - The admin performing the delete.
   */
  async deletePoolQuestion(
    poolQuestionId: string,
    deletedBy: string,
  ): Promise<void> {
    const before = await this.questions.findOne({ id: poolQuestionId });
    if (!before) {
      return;
    }

    const now = new Date();
    await this.questions.updateOne(
      { id: poolQuestionId },
      {
        $set: {
          deletedAt: now,
          deletedBy,
          updatedAt: now,
          updatedBy: deletedBy,
        },
      },
    );

    if (!this.changeLogService) {
      return;
    }

    const beforeDoc: Record<string, unknown> = {
      id: before.id,
      poolId: before.poolId,
      title: before.title,
      content: before.content,
      order: before.order,
      createdAt: before.createdAt,
      createdBy: before.createdBy,
      updatedAt: before.updatedAt,
      updatedBy: before.updatedBy,
      type: before.type,
      options: before.options,
      weight: before.weight,
      mcGradingStrategy: before.mcGradingStrategy,
      explanation: before.explanation,
      referenceAnswer: before.referenceAnswer,
      answerRevealMode: before.answerRevealMode,
      media: before.media,
    };

    await this.changeLogService.recordChange({
      questionId: poolQuestionId,
      testId: null,
      poolId: before.poolId,
      changedBy: deletedBy,
      action: "delete",
      changedFields: Object.keys(beforeDoc),
      before: beforeDoc,
      after: {},
      answeredStudentCount: 0,
    });
  }

  /**
   * Diffs `set` against `before` and writes one change-log row when at least
   * one tracked field actually differs — mirrors
   * `QuestionService`'s own `logRealChanges` (D30: parallel, not shared).
   * `answeredStudentCount` is always 0 (D51 — pool questions have no answers).
   */
  private async logRealChanges(
    before: PoolQuestionDocument,
    set: Partial<PoolQuestionDocument>,
    changedBy: string,
  ): Promise<void> {
    if (!this.changeLogService) {
      return;
    }

    const trackedFields = [
      "answerRevealMode",
      "referenceAnswer",
      "explanation",
      "title",
      "content",
      "options",
      "type",
      "mcGradingStrategy",
    ] as const;

    const changedFields: string[] = [];
    const beforeValues: Record<string, unknown> = {};
    const afterValues: Record<string, unknown> = {};
    for (const field of trackedFields) {
      if (field in set && !valuesEqual(set[field], before[field])) {
        changedFields.push(field);
        beforeValues[field] = before[field];
        afterValues[field] = set[field];
      }
    }

    if (changedFields.length === 0) {
      return;
    }

    await this.changeLogService.recordChange({
      questionId: before.id,
      testId: null,
      poolId: before.poolId,
      changedBy,
      action: "update",
      changedFields,
      before: beforeValues,
      after: afterValues,
      answeredStudentCount: 0,
    });
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

    return {
      ...base,
      type: "free_text",
      referenceAnswer: doc.referenceAnswer ?? undefined,
      explanation: doc.explanation ?? undefined,
      // Never a concrete default (D2/D9): absent means "inherit the test".
      answerRevealMode: doc.answerRevealMode ?? undefined,
    } satisfies PoolFreeTextQuestion;
  }
}
