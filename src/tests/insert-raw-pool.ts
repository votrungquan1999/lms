import type { Db } from "mongodb";
import type { QuestionPoolDocument } from "src/lib/question-pool-service";
import { TEST_SCHOOL_ID } from "./create-test-db";

/**
 * Raw-inserts a minimal question pool with a literal id in the default test
 * school, for suites that add pool questions to ids they never created
 * through `QuestionPoolService` — the pool question service refuses a pool
 * it can't find.
 * @param db - The test's isolated database.
 * @param id - The literal pool id the suite writes under.
 */
export async function insertRawPool(db: Db, id: string): Promise<void> {
  await db.collection<QuestionPoolDocument>("question_pool").insertOne({
    id,
    name: id,
    description: "",
    createdAt: new Date(),
    createdBy: "seed",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
    deletedBy: null,
    schoolId: TEST_SCHOOL_ID,
  });
}
