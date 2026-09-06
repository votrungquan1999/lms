/**
 * MongoDB connection URI for the e2e test database.
 * Must match `dev:e2e`'s `MONGODB_URI` env var (package.json) — shared here so
 * `global-setup.ts` and `auth.setup.ts` cannot drift apart.
 */

// Overridable so two checkouts of this repo can run e2e at once. A hardcoded
// name let a concurrent run in another worktree drop this one's data mid-flight.
export const E2E_DB_NAME = process.env.E2E_DB_NAME ?? "lms_e2e";
export const E2E_MONGODB_URI = `mongodb://localhost:27017/${E2E_DB_NAME}`;
