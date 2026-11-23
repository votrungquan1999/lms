import type {
  AiGradeBatchInput,
  AiGradeBatchOptions,
} from "src/lib/ai/ai-client";
import { buildGradingPrompt } from "src/lib/ai/grading-prompt";

/**
 * Builds the prompt sent to the runner: the Gemini grading prompt plus a
 * demand for bare JSON, because the runner returns free text, not a schema-bound object.
 * @param items - One entry per candidate free-text question.
 * @param opts - Optional regenerate context (teacher's reason + prior grades).
 */
export function buildRunnerGradingPrompt(
  items: AiGradeBatchInput[],
  opts?: AiGradeBatchOptions,
): string {
  return [
    buildGradingPrompt(items, opts),
    "Reply with only the JSON object: no prose, no code fence.",
  ].join("\n\n");
}
