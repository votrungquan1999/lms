import { MongoClient } from "mongodb";

/**
 * Defensive backfill: populates new optional fields on legacy `test_submission`
 * and `test` rows so production data is uniform and queryable.
 *
 * Idempotent: each `updateMany` filters on `{ <field>: { $exists: false } }`,
 * so re-running is a no-op (every per-field log line should report 0 rows
 * after the first successful run).
 *
 * Does NOT touch `gradesReleasedAt` / `correctAnswersReleasedAt` — those are
 * already null-initialized by `createTest`, and rewriting an existing value
 * would corrupt audit history.
 *
 * **Behavioral callout:** defaulting legacy `test` rows' visibility flags to
 * `true` (the `createTest` default) may flip pages that previously read
 * missing-as-`false`. Spot-check the student test page against your dataset
 * before running this in production.
 */

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set in the environment");
  process.exit(1);
}

const client = new MongoClient(uri);

interface FieldDefault {
  field: string;
  value: unknown;
}

async function backfillCollection(
  collectionName: string,
  fields: FieldDefault[],
): Promise<void> {
  const db = client.db();
  const collection = db.collection(collectionName);

  for (const { field, value } of fields) {
    const result = await collection.updateMany(
      { [field]: { $exists: false } },
      { $set: { [field]: value } },
    );
    console.log(
      `${collectionName}: backfilled ${result.modifiedCount} row(s) with ${field}`,
    );
  }
}

async function run(): Promise<void> {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    await backfillCollection("test_submission", [
      { field: "deletedAt", value: null },
      { field: "releasedAt", value: null },
      { field: "releasedBy", value: null },
    ]);

    await backfillCollection("test", [
      { field: "showGradeAfterSubmit", value: true },
      { field: "showCorrectAnswerAfterSubmit", value: true },
    ]);

    console.log("Backfill complete.");
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
