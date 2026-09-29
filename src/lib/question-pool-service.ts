import type { Collection, Db } from "mongodb";

/**
 * Question pool document stored in the `question_pool` collection.
 * Pools belong to a school, not a course — they carry no `courseId`.
 * Soft-deleted via `deletedAt`/`deletedBy` (mirrors `TestDocument`).
 */
export interface QuestionPoolDocument {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  /** Owning school. Absent or `null` on records not yet assigned — no school can see those. */
  schoolId: string | null;
}

/**
 * Client-facing question pool interface — omits audit/soft-delete fields.
 */
export interface QuestionPool {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
}

/**
 * Input for creating a new question pool.
 */
export interface CreatePoolInput {
  name: string;
  description: string;
  createdBy: string;
}

/**
 * QuestionPoolService — manages one school's pools in the `question_pool`
 * collection. Mirrors `TestService`: Document↔client split, soft-delete,
 * audit fields.
 */
export class QuestionPoolService {
  private readonly pools: Collection<QuestionPoolDocument>;

  constructor(
    db: Db,
    private readonly schoolId: string,
  ) {
    // Fail closed: a missing school would query `{ schoolId: null }`, which
    // matches exactly the pools no school owns yet.
    if (!schoolId) {
      throw new Error("A school is required to build a question pool service");
    }
    this.pools = db.collection<QuestionPoolDocument>("question_pool");
  }

  /**
   * Creates a new question pool in the bound school and returns the client view.
   */
  async createPool(input: CreatePoolInput): Promise<QuestionPool> {
    const doc: QuestionPoolDocument = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      createdAt: new Date(),
      createdBy: input.createdBy,
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      schoolId: this.schoolId,
    };

    await this.pools.insertOne(doc);

    return this.toPool(doc);
  }

  /**
   * Returns a single non-deleted pool by id, or null when missing/deleted.
   */
  async getPool(poolId: string): Promise<QuestionPool | null> {
    const doc = await this.pools.findOne({
      id: poolId,
      deletedAt: null,
      schoolId: this.schoolId,
    });
    return doc ? this.toPool(doc) : null;
  }

  /**
   * Returns every non-deleted pool of the bound school, newest-first.
   */
  async listPools(): Promise<QuestionPool[]> {
    const docs = await this.pools
      .find({ deletedAt: null, schoolId: this.schoolId })
      .sort({ createdAt: -1 })
      .toArray();

    return docs.map((doc) => this.toPool(doc));
  }

  /**
   * Renames a pool and stamps audit fields.
   * @throws "Pool not found" when the pool is missing, already deleted, or belongs to another school.
   */
  async renamePool(
    poolId: string,
    name: string,
    updatedBy: string,
  ): Promise<void> {
    const result = await this.pools.updateOne(
      { id: poolId, schoolId: this.schoolId, deletedAt: null },
      { $set: { name, updatedAt: new Date(), updatedBy } },
    );
    if (result.matchedCount === 0) {
      throw new Error("Pool not found");
    }
  }

  /**
   * Soft-deletes a pool so it no longer appears in `listPools`/`getPool`.
   * @throws "Pool not found" when the pool is missing, already deleted, or belongs to another school.
   */
  async deletePool(poolId: string, deletedBy: string): Promise<void> {
    const result = await this.pools.updateOne(
      { id: poolId, schoolId: this.schoolId, deletedAt: null },
      {
        $set: {
          deletedAt: new Date(),
          deletedBy,
          updatedAt: new Date(),
          updatedBy: deletedBy,
        },
      },
    );
    if (result.matchedCount === 0) {
      throw new Error("Pool not found");
    }
  }

  private toPool(doc: QuestionPoolDocument): QuestionPool {
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description,
      createdAt: doc.createdAt,
    };
  }
}
