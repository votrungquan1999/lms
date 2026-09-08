import { MongoClient } from "mongodb";

// Overridable so two checkouts of this repo can run e2e at once. Both used to
// hardcode `lms_e2e` and drop every collection at startup, so a concurrent run
// in another worktree silently deleted this one's data mid-flight.
const DB_NAME = process.env.E2E_DB_NAME ?? "lms_e2e";
const MONGODB_URI = `mongodb://localhost:27017/${DB_NAME}`;

/**
 * Global setup — runs once before all tests.
 * Clears the test database to ensure a clean state for each test run.
 */
async function globalSetup() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    // Drop all collections to start fresh
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.dropCollection(collection.name);
    }

    console.log(`[e2e global-setup] Cleared database: ${DB_NAME}`);
  } finally {
    await client.close();
  }
}

export default globalSetup;
