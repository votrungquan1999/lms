/**
 * Grace period (ms) added to a timed test's deadline. Absorbs the at-zero
 * auto-submit round-trip and small client/server clock skew, so a submission
 * fired exactly at the visible 00:00 is still accepted.
 */
export const GRACE_MS = 60_000;

/**
 * Pure boundary check shared by the submit and answer write paths so they
 * agree exactly on when a timed test is closed.
 *
 * - Untimed (`timeLimitMinutes === null`) is never past the deadline.
 * - A timed test with no recorded `startedAt` has no enforceable deadline yet
 *   (treated as allowed).
 * - Otherwise the deadline is `startedAt + timeLimitMinutes + GRACE`, and the
 *   boundary is strict: only `now` strictly greater than the deadline is past.
 *
 * @param startedAt - When the student started the test, or null if not started.
 * @param timeLimitMinutes - The test's time limit in minutes, or null if untimed.
 * @param now - The current server time.
 */
export function isPastEnforcementDeadline(
  startedAt: Date | null,
  timeLimitMinutes: number | null,
  now: Date,
): boolean {
  if (timeLimitMinutes === null) return false;
  if (startedAt === null) return false;
  const deadline = startedAt.getTime() + timeLimitMinutes * 60_000 + GRACE_MS;
  return now.getTime() > deadline;
}
