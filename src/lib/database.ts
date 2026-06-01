import { type Db, MongoClient } from "mongodb";
import { loadConfig } from "./config";
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
  db = tracedDb(client.db());

  return db;
}

/**
 * Returns the raw MongoDB client for cleanup/shutdown.
 */
export function getMongoClient(): MongoClient | null {
  return client;
}
