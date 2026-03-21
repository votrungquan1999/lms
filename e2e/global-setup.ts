import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb://localhost:27017/lms_e2e";

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

    console.log(`[e2e global-setup] Cleared database: lms_e2e`);
  } finally {
    await client.close();
  }
}

export default globalSetup;
