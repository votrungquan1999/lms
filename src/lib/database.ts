import { type Db, MongoClient } from "mongodb";
import { loadConfig } from "./config";
import { JoinRequestStatus } from "./course-join-request-service";
import { tracedDb } from "./observability/traced-collection";

/**
 * Lazy singleton for MongoDB connection.
 * All services should use this to get the database instance,
 * ensuring a single connection pool across the app.
 */

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const config = loadConfig();
  client = new MongoClient(config.mongodbUri);
  await client.connect();
  // Wrap once at connection time so every service receives span-aware
  // collection handles; the wrapped Db is cached in the module singleton.
  const connectedDb = tracedDb(client.db());
  await ensureIndexes(connectedDb);
  // Cache only after indexes succeed — caching before this point would leave
  // a thrown ensureIndexes permanently stuck: db would already be non-null,
  // so every later getDatabase() call would return early and never retry it.
  db = connectedDb;

  return db;
}

/**
 * Returns the raw MongoDB client for cleanup/shutdown.
 */
export function getMongoClient(): MongoClient | null {
  return client;
}

/**
 * Creates the indexes this app depends on for correctness (not just speed).
 * Exported so tests can apply them to their own per-test database.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  // Partial (not plain) unique index — a plain one would also block a
  // rejected student from ever re-requesting (D11/D51 say they can). This
  // makes duplicate concurrent submits for the same pair impossible (F10).
  await db.collection("course_join_request").createIndex(
    { courseId: 1, studentId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: JoinRequestStatus.Pending },
    },
  );

  // Backs the admin queue's `find({status}).sort({requestedAt, _id}).skip().limit()`
  // and its `countDocuments({status})` — without this, both scan the whole
  // collection instead of a single status range.
  await db
    .collection("course_join_request")
    .createIndex({ status: 1, requestedAt: 1, _id: 1 });

  // Not partial — an enrollment has no status dimension to filter on, unlike
  // the join-request index above. Without this, two concurrent enrollments
  // for the same pair (e.g. a raced approve, or an approve racing the
  // roster-dialog save) both insert, and the student renders twice in the
  // grading roster with no self-healing.
  await db
    .collection("enrollment")
    .createIndex({ courseId: 1, studentId: 1 }, { unique: true });
}
