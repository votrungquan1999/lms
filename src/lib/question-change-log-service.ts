import type { Collection, Db } from "mongodb";

/**
 * Change-log document stored in the `questionChangeLog` collection.
 * Append-only — one row per REAL change (no row for a no-op save), same
 * posture as `answer`: no update method, no soft-delete of its own.
 *
 * `before`/`after` hold only the fields named in `changedFields`, at their
 * real values — never a field-name list or a rendered text diff. This is
 * load-bearing for `options`: a rewritten option list mints fresh ids, so a
 * student's stored `selectedIds` can only be mapped back to the option text
 * they actually saw by reading `before.options` in full (ids included) from
 * this row. `answeredStudentCount` is snapshotted here because it cannot be
 * recomputed once the question has moved on.
 */
export interface QuestionChangeLogDocument {
  id: string;
  questionId: string;
  testId: string | null;
  poolId: string | null;
  changedAt: Date;
  changedBy: string;
  action: "update" | "delete";
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  answeredStudentCount: number;
}

/** Input for recording one real change to a question. */
export interface RecordQuestionChangeInput {
  questionId: string;
  testId: string | null;
  poolId: string | null;
  changedBy: string;
  action: "update" | "delete";
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  answeredStudentCount: number;
}

/**
 * QuestionChangeLogService — manages the `questionChangeLog` collection,
 * constructed from `db` alone (same shape as `AnnotationService`). No UI
 * reads this in this run (D48): recovering from a bad edit means reading the
 * collection directly.
 */
export class QuestionChangeLogService {
  private readonly changes: Collection<QuestionChangeLogDocument>;

  constructor(db: Db) {
    this.changes =
      db.collection<QuestionChangeLogDocument>("questionChangeLog");
  }

  /**
   * Records one real change to a question. Callers are responsible for
   * only calling this when at least one field actually differs — this
   * method stores whatever it is given.
   */
  async recordChange(input: RecordQuestionChangeInput): Promise<void> {
    const doc: QuestionChangeLogDocument = {
      id: crypto.randomUUID(),
      questionId: input.questionId,
      testId: input.testId,
      poolId: input.poolId,
      changedAt: new Date(),
      changedBy: input.changedBy,
      action: input.action,
      changedFields: input.changedFields,
      before: input.before,
      after: input.after,
      answeredStudentCount: input.answeredStudentCount,
    };

    await this.changes.insertOne(doc);
  }
}
