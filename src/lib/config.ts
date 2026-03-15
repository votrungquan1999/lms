/**
 * Global application configuration.
 * Reads from environment variables with sensible defaults.
 */

export interface AppConfig {
  /** MongoDB connection URI. */
  mongodbUri: string;
  /** Secret for Better Auth session signing. */
  authSecret: string;
  /** Allowed hosts for dynamic base URL resolution. */
  authAllowedHosts: string[];
  /** Google OAuth credentials (required). */
  google: {
    clientId: string;
    clientSecret: string;
  };
  /** List of email addresses recognized as admin. */
  adminEmails: string[];
  /** Trusted origins for Better Auth CORS. */
  trustedOrigins: string[];
}

/**
 * Loads app config from environment variables with defaults.
 */
export function loadConfig(): AppConfig {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing required env vars: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set",
    );
  }

  return {
    mongodbUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/lms",
    authSecret:
      process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",
    authAllowedHosts: (process.env.AUTH_ALLOWED_HOSTS ?? "localhost:3000")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    google: { clientId: googleClientId, clientSecret: googleClientSecret },
    adminEmails: (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  };
}
