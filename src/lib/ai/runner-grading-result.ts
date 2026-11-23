import type { AiGradeBatchOutput } from "./ai-client";
import { aiGradeBatchSchema } from "./grading-schema";

/** Why a runner result text could not be used. */
export type RunnerGradingResultFailure = "not_json" | "schema_mismatch";

const LEADING_FENCE = /^```(?:json)?\s*/i;
const TRAILING_FENCE = /\s*```$/;

/**
 * Reads the grades out of the text a runner job returned.
 * Tolerates one surrounding JSON code fence; never throws and never returns the raw text.
 * @param text - The job's result text.
 * @returns The grades, or why the text is unusable.
 */
export function parseRunnerGradingResult(
  text: string,
): { grades: AiGradeBatchOutput[] } | { reason: RunnerGradingResultFailure } {
  const unfenced = text
    .trim()
    .replace(LEADING_FENCE, "")
    .replace(TRAILING_FENCE, "");

  let json: unknown;
  // Intentional boundary: prose or truncated text becomes a reason, not a throw.
  try {
    json = JSON.parse(unfenced);
  } catch {
    return { reason: "not_json" };
  }

  const parsed = aiGradeBatchSchema.safeParse(json);
  return parsed.success
    ? { grades: parsed.data.grades }
    : { reason: "schema_mismatch" };
}
