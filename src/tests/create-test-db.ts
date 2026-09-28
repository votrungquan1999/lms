import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import type { TestAPI } from "vitest";

/** The default test school: harness services are bound to it unless a test asks for another. */
export const TEST_SCHOOL_ID = "00000000-0000-4000-8000-000000000001";

/** The default test school as sessions carry it. */
export const TEST_SCHOOL = { id: TEST_SCHOOL_ID, name: "Test School" };

/**
 * Database context injected into each test by withTestDb.
 */
interface TestDbContext {
  /** Isolated database instance with a unique name. */
  db: Db;
  /** MongoDB client for the test connection. */
  client: MongoClient;
}

/**
 * Higher-order function that wraps a Vitest `test` function and returns
 * a new test function that injects an isolated MongoDB database context.
 *
 * Each test gets its own uniquely-named database, created before the test
 * runs and dropped after it completes. This allows tests to run in parallel
 * without interfering with each other.
 *
 * @param testFn - The Vitest `test` (or `it`) function to wrap.
 * @returns A new test function where the callback receives `{ db, client }`.
 *
 * @example
 * ```ts
 * import { it } from "vitest";
 * import { withTestDb } from "src/tests/create-test-db";
 *
 * const dbIt = withTestDb(it);
 *
 * dbIt("should insert a document", async ({ db }) => {
 *   await db.collection("users").insertOne({ name: "Alice" });
 *   const user = await db.collection("users").findOne({ name: "Alice" });
 *   expect(user).toBeDefined();
 * });
 * ```
 */
export function withTestDb(testFn: TestAPI) {
  return (
    name: string,
    fn: (ctx: TestDbContext) => Promise<void>,
    timeout?: number,
  ) => {
    testFn(
      name,
      async () => {
        const mongoUri = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
        const dbName = `lms-test-${randomUUID()}`;

        const client = new MongoClient(mongoUri);
        await client.connect();
        const db = client.db(dbName);

        try {
          await fn({ db, client });
        } finally {
          await client.db(dbName).dropDatabase();
          await client.close();
        }
      },
      timeout,
    );
  };
}
