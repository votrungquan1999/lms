import { randomUUID } from "node:crypto";
import { type Db, MongoServerError } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Lists a collection's indexes, treating a namespace that was never created
 * (no index and no document ever written to it) as zero indexes instead of
 * letting the driver's NamespaceNotFound error mask the assertion below —
 * that IS the observable shape of "ensureIndexes never ran".
 */
async function listIndexesOrEmpty(db: Db, collectionName: string) {
  try {
    return await db.collection(collectionName).listIndexes().toArray();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 26) {
      return [];
    }
    throw error;
  }
}

/**
 * Feature: Production database boot wires the safety indexes
 * As the app
 * I want the real getDatabase() singleton — not just the exported
 * ensureIndexes helper every other test calls directly against its own
 * per-test database — to create the indexes on first connect
 * So that a freshly-provisioned production database can never boot without
 * the duplicate-Pending guard and the double-enrollment guard
 */
describe("Feature: Production database boot wires the safety indexes", () => {
  describe("Scenario: getDatabase() connects to a fresh database for the first time", () => {
    it("creates the partial unique join-request index and the unique enrollment index", async () => {
      const mongoBaseUri =
        process.env.MONGODB_URI ?? "mongodb://localhost:27017";
      const dbName = `lms-test-database-wiring-${randomUUID()}`;
      const uri = `${mongoBaseUri}/${dbName}`;

      // Given a real config pointing at a fresh database — every other test
      // in the suite mocks services-singleton/auth-singleton, so this is the
      // only place the real getDatabase() ever actually runs
      vi.stubEnv("MONGODB_URI", uri);
      vi.stubEnv("GOOGLE_CLIENT_ID", "gid");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "gsecret");
      vi.stubEnv("AWS_REGION", "ap-southeast-1");
      vi.stubEnv("S3_BUCKET_NAME", "quanvo-lms");
      vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIAEXAMPLE");
      vi.stubEnv("AWS_SECRET_ACCESS_KEY", "s3cr3t");

      // database.ts caches its connection in a module-level singleton —
      // reset the registry so this test gets an uncached getDatabase()
      vi.resetModules();
      const { getDatabase, getMongoClient } = await import("../database");

      try {
        // When the real getDatabase() connects for the first time
        const db = await getDatabase();

        // Then the join-request partial unique index exists...
        const joinRequestIndexes = await listIndexesOrEmpty(
          db,
          "course_join_request",
        );
        const pendingUniqueIndex = joinRequestIndexes.find(
          (index) => index.key.courseId === 1 && index.key.studentId === 1,
        );
        expect(pendingUniqueIndex?.unique).toBe(true);
        expect(pendingUniqueIndex?.partialFilterExpression).toEqual({
          status: "pending",
        });

        // ...and the enrollment unique index exists
        const enrollmentIndexes = await listIndexesOrEmpty(db, "enrollment");
        const enrollmentUniqueIndex = enrollmentIndexes.find(
          (index) => index.key.courseId === 1 && index.key.studentId === 1,
        );
        expect(enrollmentUniqueIndex?.unique).toBe(true);

        // ...and the school slug unique index exists
        const schoolIndexes = await listIndexesOrEmpty(db, "school");
        const schoolSlugUniqueIndex = schoolIndexes.find(
          (index) => index.key.slug === 1,
        );
        expect(schoolSlugUniqueIndex?.unique).toBe(true);

        // ...and the school_membership unique index exists
        const membershipIndexes = await listIndexesOrEmpty(
          db,
          "school_membership",
        );
        const membershipUniqueIndex = membershipIndexes.find(
          (index) => index.key.schoolId === 1 && index.key.userId === 1,
        );
        expect(membershipUniqueIndex?.unique).toBe(true);

        // ...and a school-led index serves every school's course list
        const courseIndexes = await listIndexesOrEmpty(db, "course");
        const courseSchoolIndex = courseIndexes.find(
          (index) => index.key.schoolId === 1,
        );
        expect(courseSchoolIndex).toBeDefined();

        // ...and a school-led index serves every school's test list
        const testIndexes = await listIndexesOrEmpty(db, "test");
        const testSchoolIndex = testIndexes.find(
          (index) => index.key.schoolId === 1,
        );
        expect(testSchoolIndex).toBeDefined();

        // ...and a school-led index serves every school's student list
        const studentIndexes = await listIndexesOrEmpty(db, "student");
        const studentSchoolIndex = studentIndexes.find(
          (index) => index.key.schoolId === 1,
        );
        expect(studentSchoolIndex).toBeDefined();

        // ...and the student authUserId unique index exists — one
        // profile per Better Auth sign-in account, across every school
        const studentAuthUserIdIndex = studentIndexes.find(
          (index) => index.key.authUserId === 1,
        );
        expect(studentAuthUserIdIndex?.unique).toBe(true);

        // ...and a school-led index serves every school's pool list
        const poolIndexes = await listIndexesOrEmpty(db, "question_pool");
        const poolSchoolIndex = poolIndexes.find(
          (index) => index.key.schoolId === 1,
        );
        expect(poolSchoolIndex).toBeDefined();

        // ...and a school-led index serves every school's join-request queue
        const queueIndex = joinRequestIndexes.find(
          (index) =>
            JSON.stringify(index.key) ===
            JSON.stringify({ schoolId: 1, status: 1, requestedAt: 1, _id: 1 }),
        );
        expect(queueIndex).toBeDefined();

        // ...and the old queue index that ignored the school is not created
        const unscopedQueueIndex = joinRequestIndexes.find(
          (index) =>
            JSON.stringify(index.key) ===
            JSON.stringify({ status: 1, requestedAt: 1, _id: 1 }),
        );
        expect(unscopedQueueIndex).toBeUndefined();
      } finally {
        const client = getMongoClient();
        if (client) {
          await client.db(dbName).dropDatabase();
          await client.close();
        }
      }
    });
  });
});
