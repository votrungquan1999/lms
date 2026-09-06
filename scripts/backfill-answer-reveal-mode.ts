import { MongoClient } from "mongodb";

/**
 * Idempotent backfill: `test` rows written before `answerRevealMode` existed
 * default to "diff" — the side-by-side comparison their students were
 * already seeing. This is belt-and-braces, not load-bearing: `toTest`'s own
 * read-time fallback already applies the same default (D7/D9), so an
 * un-migrated row behaves correctly even before this script ever runs.
 *
 * Filters on `{ answerRevealMode: null }`, which matches both a missing
 * field and an explicit null (the shape a since-fixed create-test.ts bug
 * wrote) — so re-running is a no-op.
 */

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set in the environment");
  process.exit(1);
}

const client = new MongoClient(uri);

async function run(): Promise<void> {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const db = client.db();
    const result = await db
      .collection("test")
      .updateMany(
        { answerRevealMode: null },
        { $set: { answerRevealMode: "diff" } },
      );
    console.log(
      `test: backfilled ${result.modifiedCount} row(s) with answerRevealMode`,
    );

    console.log("Backfill complete.");
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
