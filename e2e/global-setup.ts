import { MongoClient } from "mongodb";
import { E2E_DB_NAME, E2E_MONGODB_URI } from "./mongodb-uri";

/**
 * Global setup — runs once before all tests.
 * Clears the test database to ensure a clean state for each test run.
 */
async function globalSetup() {
  const client = new MongoClient(E2E_MONGODB_URI);

  try {
    await client.connect();
    const db = client.db();

    // Drop all collections to start fresh
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.dropCollection(collection.name);
    }

    console.log(`[e2e global-setup] Cleared database: ${E2E_DB_NAME}`);
  } finally {
    await client.close();
  }
}

export default globalSetup;
