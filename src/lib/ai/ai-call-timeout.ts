/**
 * Total limit per AI call, retries included. A 31-question exam took ~2 minutes
 * to read; it must stay under Vercel's 300s function limit (Hobby, Fluid
 * compute) so the failure is still recorded. Kept free of SDK imports so the
 * browser's read timer can derive from it.
 */
export const AI_CALL_TIMEOUT_MS = 240_000;
