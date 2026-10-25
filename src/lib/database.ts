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
 * The builds are independent, so they run together to keep the cold start to
 * one round trip; a unique build that hits duplicates still rejects, which
 * fails the boot on purpose.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    // Partial (not plain) unique index — a plain one would also block a
    // rejected student from ever re-requesting (D11/D51 say they can). This
    // makes duplicate concurrent submits for the same pair impossible (F10).
    db
      .collection("course_join_request")
      .createIndex(
        { courseId: 1, studentId: 1 },
        {
          unique: true,
          partialFilterExpression: { status: JoinRequestStatus.Pending },
        },
      ),

    // Not partial — an enrollment has no status dimension to filter on, unlike
    // the join-request index above. Without this, two concurrent enrollments
    // for the same pair (e.g. a raced approve, or an approve racing the
    // roster-dialog save) both insert, and the student renders twice in the
    // grading roster with no self-healing.
    db
      .collection("enrollment")
      .createIndex({ courseId: 1, studentId: 1 }, { unique: true }),

    // The owner-typed slug is a school's only unique key; names may repeat.
    db
      .collection("school")
      .createIndex({ slug: 1 }, { unique: true }),

    // Every admin request resolves its schools by id.
    db
      .collection("school")
      .createIndex({ id: 1 }, { unique: true }),

    // One membership per (school, user) pair — a second "add admin" for the
    // same school must be refused, not silently duplicated.
    db
      .collection("school_membership")
      .createIndex({ schoolId: 1, userId: 1 }, { unique: true }),

    // Every admin request lists a user's memberships.
    db
      .collection("school_membership")
      .createIndex({ userId: 1 }),

    // Every course, test, student and pool list filters by school first.
    db
      .collection("course")
      .createIndex({ schoolId: 1 }),
    db.collection("test").createIndex({ schoolId: 1 }),
    db.collection("student").createIndex({ schoolIds: 1 }),
    db.collection("question_pool").createIndex({ schoolId: 1 }),

    // One student profile per Better Auth sign-in account, across every
    // school — a raced or repeated Google provisioning attempt must fail at
    // the database, not just at an app-level check.
    db
      .collection("student")
      .createIndex({ authUserId: 1 }, { unique: true }),

    // One username across every school, not just within one — the
    // authoritative guard behind a raced or stale app-level username check.
    db
      .collection("student")
      .createIndex({ username: 1 }, { unique: true }),

    // Backs each school's admin queue: `find({schoolId, status})` sorted by
    // `{requestedAt, _id}` with skip/limit, and its `countDocuments`. Replaces
    // the old unscoped `{status, requestedAt, _id}` index, which is never
    // dropped here: a failed drop would fail every boot (the backfill drops it).
    db
      .collection("course_join_request")
      .createIndex({ schoolId: 1, status: 1, requestedAt: 1, _id: 1 }),
  ]);
}
