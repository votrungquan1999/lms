import { MongoClient } from "mongodb";
import { AuthService } from "./auth-service";
import { loadConfig } from "./config";

/**
 * Lazy singleton: one AuthService + MongoClient per server process.
 * Used by API routes, server actions, and proxy.
 */

let authService: AuthService | null = null;
let mongoClient: MongoClient | null = null;

export async function getAuthService(): Promise<AuthService> {
  if (authService) {
    return authService;
  }

  const config = loadConfig();
  mongoClient = new MongoClient(config.mongodbUri);
  await mongoClient.connect();

  const db = mongoClient.db();
  authService = new AuthService(db, config);

  return authService;
}

/**
 * Returns the raw MongoDB client for cleanup/shutdown.
 */
export function getMongoClient(): MongoClient | null {
  return mongoClient;
}
