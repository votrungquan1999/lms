import type { Collection, Db } from "mongodb";
import type { AnswerService } from "src/lib/answer-service";
import type { QuestionChangeLogService } from "src/lib/question-change-log-service";
import {
  type ComposePoolSelection,
  type PoolQuestionSnapshotInput,
  type QuestionSampler,
  shuffleAndTake,
} from "src/lib/question-compose";
import type { AnswerRevealMode } from "src/lib/test-service";

/**
 * Checks whether MC options satisfy the correctness rule for their question
 * type, returning an error message instead of throwing — `addQuestion` throws
 * from this directly, while the AI-import pre-pass (Step 18) uses the message
 * to name the offending question without failing partway through a batch.
 * - `single_select`: exactly one correct option.
 * - `multi_select`: at least one correct option.
 * - `free_text` / `image_answer`: never an error (no options to check).
 *
 * `allowMissingAnswerKey` (D32) relaxes the "must have a key" floor —
 * `single_select` accepts 0 or 1 correct (still rejects 2+: a wrong key, not
 * a missing one), `multi_select` drops its "at least one" floor entirely.
 * Only the AI-import call site passes this; every other caller (manual add,
 * JSON import, pool compose) keeps today's rule unchanged.
 * @param type - The question's type.
 * @param options - The question's options, or null for a non-MC type.
 * @param opts - `allowMissingAnswerKey` opts into the D32 relaxation.
 * @returns An error message, or null when the options are acceptable.
 */
export function checkMcOptions(
  type: QuestionType,
  options: { isCorrect: boolean }[] | null,
  opts?: { allowMissingAnswerKey?: boolean },
): string | null {
  const allowMissingAnswerKey = opts?.allowMissingAnswerKey ?? false;
  const correctCount = options?.filter((o) => o.isCorrect).length ?? 0;

  if (type === "single_select") {
    const minRequired = allowMissingAnswerKey ? 0 : 1;
    if (correctCount < minRequired || correctCount > 1) {
      return "single_select question must have exactly one correct option";
    }
  }

  if (type === "multi_select" && !allowMissingAnswerKey && correctCount === 0) {
    return "multi_select question must have at least one correct option";
  }

  return null;
}

/**
 * Value equality for change-log diffing — `options` is an array of plain
 * objects, so `!==` (reference equality) would treat every save as a change
 * even when nothing inside it actually differs. A recursive structural
 * comparison, not `JSON.stringify` equality: object key order isn't
 * guaranteed to match between a freshly-built `set` value and the one read
 * back from Mongo, and `JSON.stringify` is order-sensitive.
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
  /** Overrides the test's answerRevealMode for this question; absent means inherit the test. */
  answerRevealMode?: AnswerRevealMode;
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
  /** Overrides the test's answerRevealMode for this question; absent means inherit the test. */
  answerRevealMode?: AnswerRevealMode;
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

/**
 * Input for correcting a question a teacher already wrote. Named per-field,
 * matching `TestService.updateTestSettings` rather than a generic
 * `Partial<Question>` — no entity in this repo has a generic update.
 * A field's absence from this object means "leave unchanged"; for
 * `answerRevealMode` specifically, an explicit `null` is a third, distinct
 * state — "clear back to inherit the test" (D2) — never conflated with unset.
 */
export interface UpdateQuestionInput {
  answerRevealMode?: AnswerRevealMode | null;
  /** Free-text model answer. `null` clears it back to absent. */
  referenceAnswer?: string | null;
  /** Teacher note shown once the answer is revealed; shared by MC and free_text. `null` clears it. */
  explanation?: string | null;
  /** Always required on the document — no clear state, unlike the fields above. */
  title?: string;
  content?: string;
  /**
   * Switches what kind of question this is (Step 28 / D46). D54: the
   * document always agrees with its type — fields the new type cannot hold
   * are cleared, not left dormant.
   */
  type?: QuestionType;
  /**
   * Rewrites an MC question's option list (Step 27). `id` present means
   * "keep this option's id" (D53) — omit it only for a genuinely new
   * option, which gets a fresh id minted on save. An option whose id is
   * missing from this array is dropped, which is what strands a student
   * who had selected it.
   */
  options?: { id?: string; text: string; isCorrect: boolean }[];
}

/**
 * Write-policy options for {@link QuestionService.addQuestion} — kept off
 * `AddQuestionInput` since this governs a validation rule, not a document
 * field, and would otherwise have to be excluded from persistence.
 */
export interface AddQuestionOpts {
  /** D32: relaxes the MC-key rule to match the AI-import pre-pass (`findFirstQuestionError`). Only that call site opts in. */
  allowMissingAnswerKey?: boolean;
}

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
  /** Per-question override of the test's answerRevealMode; null means inherit the test. */
  answerRevealMode: AnswerRevealMode | null;
  /** Ordered media attachments (empty when none). */
  media: QuestionMediaDocument[];
  /** Soft-delete marker (D47) — non-null means this question is a tombstone. */
  deletedAt: Date | null;
  deletedBy: string | null;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class QuestionService {
  private readonly questions: Collection<QuestionDocument>;

  /**
   * `changeLogService` and `getAnswerService` are optional so every existing
   * direct `new QuestionService(db)` call site keeps compiling and logs
   * nothing (D48 requires a real log; the many unit tests that never touch
   * `updateQuestion` don't need one wired). `getAnswerService` is a lazy
   * getter, not an instance — `AnswerService` itself depends on
   * `QuestionService`, so passing an instance here would be a construction
   * cycle. Mirrors `GradeVisibilityService`'s `getTestSubmissionService`
   * thunk in `services-singleton.ts`.
   */
  constructor(
    db: Db,
    private readonly changeLogService?: QuestionChangeLogService,
    private readonly getAnswerService?: () => Promise<AnswerService>,
  ) {
    this.questions = db.collection<QuestionDocument>("question");
  }

  async addQuestion(
    testId: string,
    input: AddSingleSelectQuestionInput,
    opts?: AddQuestionOpts,
  ): Promise<SingleSelectQuestion>;
  async addQuestion(
    testId: string,
    input: AddMultiSelectQuestionInput,
    opts?: AddQuestionOpts,
  ): Promise<MultiSelectQuestion>;
  async addQuestion(
    testId: string,
    input: AddFreeTextQuestionInput,
    opts?: AddQuestionOpts,
  ): Promise<FreeTextQuestion>;
  async addQuestion(
    testId: string,
    input: AddImageAnswerQuestionInput,
    opts?: AddQuestionOpts,
  ): Promise<ImageAnswerQuestion>;
  async addQuestion(
    testId: string,
    input: AddQuestionInput,
    opts?: AddQuestionOpts,
  ): Promise<Question> {
    const nextOrder = await this.getNextOrder(testId);

    const type: QuestionType = input.type ?? "free_text";
    const options: McOption[] | null =
      "options" in input && input.options != null
        ? input.options.map((o) => ({ ...o, id: crypto.randomUUID() }))
        : null;

    const mcError = checkMcOptions(type, options, opts);
    if (mcError) {
      throw new Error(mcError);
    }

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
      answerRevealMode:
        "answerRevealMode" in input ? (input.answerRevealMode ?? null) : null,
      media: input.media ?? [],
      deletedAt: null,
      deletedBy: null,
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
      type: "free_text" as const,
      options: null,
      weight: 1,
      mcGradingStrategy: null,
      explanation: null,
      referenceAnswer: null,
      answerRevealMode: null, // bulk JSON import carries no per-question override
      media: [],
      deletedAt: null,
      deletedBy: null,
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
      answerRevealMode: item.answerRevealMode,
      // Media keys are copied verbatim — shared S3 objects, read-only.
      media: item.media.map((m) => ({ ...m })),
      deletedAt: null,
      deletedBy: null,
    }));

    await this.questions.insertMany(docs);

    return docs.map(this.toQuestion);
  }

  /**
   * Corrects fields on a question a teacher already wrote and stamps who/when.
   * Only fields present on `input` are touched (see {@link UpdateQuestionInput}).
   * @param questionId - The question to update.
   * @param input - The fields to change.
   * @param updatedBy - The admin making the change.
   */
  async updateQuestion(
    questionId: string,
    input: UpdateQuestionInput,
    updatedBy: string,
  ): Promise<void> {
    const before = await this.questions.findOne({ id: questionId });

    const set: Partial<QuestionDocument> = {
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
    // Resolves to the type this document will hold AFTER this save — used
    // by both the MC-rule check and the D54 field-clearing below. Reading
    // neither key at all (a title/content-only edit) must never resolve to
    // anything but the stored type, so an existing D32 keyless MC question
    // is never re-validated by an edit that has nothing to do with it.
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
      // D53: keep the id the caller supplied (an option it didn't remove);
      // mint a fresh one only for a genuinely new option. The MC rule is
      // re-run against the resolved (post-edit) type/options — Step 18
      // already extracted it as a shared pure function, reused here rather
      // than re-implemented. Skipped entirely when this save touches
      // neither field, so a stored D32 keyless MC question is never
      // re-validated by an unrelated edit.
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
      const mcError = checkMcOptions(resolvedType, resolvedOptions);
      if (mcError) {
        throw new Error(mcError);
      }
      // D54: the type governs what's stored, not whether the caller
      // supplied an options array — a free_text/image_answer save that
      // carries options never persists them (closes the loophole where the
      // two fields disagree about what the document is).
      if (optionsProvided) {
        set.options = isMcQuestionType(resolvedType) ? resolvedOptions : null;
      }
    }

    await this.questions.updateOne({ id: questionId }, { $set: set });

    if (before) {
      await this.logRealChanges(before, set, updatedBy);
    }
  }

  /**
   * Diffs `set` against `before` and writes one change-log row when at least
   * one tracked field actually differs (D48/D50) — a no-op save (every
   * incoming value already matches what's stored) writes nothing, so the log
   * stays readable as a record of real edits.
   */
  private async logRealChanges(
    before: QuestionDocument,
    set: Partial<QuestionDocument>,
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
      // `options` is an array — `!==` would fire on every save since a
      // rewritten array is never the same reference as the stored one, even
      // when every value inside it is identical. Compare by value for every
      // field so a genuine no-op (array or scalar) logs nothing.
      if (field in set && !valuesEqual(set[field], before[field])) {
        changedFields.push(field);
        beforeValues[field] = before[field];
        afterValues[field] = set[field];
      }
    }

    if (changedFields.length === 0) {
      return;
    }

    // Snapshotted here (D48) because it cannot be recomputed once the
    // question has moved on.
    const answeredStudentCount = this.getAnswerService
      ? ((
          await (
            await this.getAnswerService()
          ).countAnsweredStudentsByQuestionIds([before.id])
        ).get(before.id) ?? 0)
      : 0;

    await this.changeLogService.recordChange({
      questionId: before.id,
      testId: before.testId,
      poolId: null,
      changedBy,
      action: "update",
      changedFields,
      before: beforeValues,
      after: afterValues,
      answeredStudentCount,
    });
  }

  /**
   * Soft-deletes a question (D37/D47): stamps `deletedAt`/`deletedBy` rather
   * than removing the row, so `answer`/`grade` rows pointing at it stay
   * resolvable for audit purposes. Records its own change-log row carrying
   * the whole question as `before` — the strand stays diagnosable even if
   * the tombstone is later purged.
   * @param questionId - The question to delete.
   * @param deletedBy - The admin performing the delete.
   */
  async deleteQuestion(questionId: string, deletedBy: string): Promise<void> {
    const before = await this.questions.findOne({ id: questionId });
    if (!before) {
      return;
    }

    const now = new Date();
    await this.questions.updateOne(
      { id: questionId },
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

    const answeredStudentCount = this.getAnswerService
      ? ((
          await (
            await this.getAnswerService()
          ).countAnsweredStudentsByQuestionIds([questionId])
        ).get(questionId) ?? 0)
      : 0;

    // Named fields only — `_id` is Mongo's own bookkeeping, not part of the
    // question's identity, so it's left out of the domain-level audit trail.
    const beforeDoc: Record<string, unknown> = {
      id: before.id,
      testId: before.testId,
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
      questionId,
      testId: before.testId,
      poolId: null,
      changedBy: deletedBy,
      action: "delete",
      changedFields: Object.keys(beforeDoc),
      before: beforeDoc,
      after: {},
      answeredStudentCount,
    });
  }

  async listQuestions(testId: string): Promise<Question[]> {
    const docs = await this.questions
      .find({ testId, deletedAt: null })
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
      { $match: { testId: { $in: testIds }, deletedAt: null } },
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
    // Excludes tombstones (D47) — this is what lets a REPLACE renumber from
    // 1. Accepted consequence: a live question can share an order with a
    // deleted one, which is why restoring a delete is not supported.
    const last = await this.questions
      .find({ testId, deletedAt: null })
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
      // Never a concrete default (D2/D9): absent means "inherit the test".
      answerRevealMode: doc.answerRevealMode ?? undefined,
    } satisfies FreeTextQuestion;
  }
}
