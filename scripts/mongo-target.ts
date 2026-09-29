/**
 * Credential-stripped connection target for logging, split into its own
 * file (no top-level side effect) so it can be unit-tested directly against
 * both mongodb:// and mongodb+srv:// forms.
 */

/**
 * Formats a MONGODB_URI as "host / database" with any `user:pass@`
 * credentials removed — safe to print before the backfill's first read.
 * Never throws: an unparsable URI still prints something rather than
 * crashing the script before it has done anything.
 */
export function describeMongoTarget(uri: string): string {
  try {
    const parsed = new URL(uri);
    const database = parsed.pathname.replace(/^\//, "") || "(default)";
    return `${parsed.host} / ${database}`;
  } catch {
    return "(unparsable MONGODB_URI)";
  }
}
