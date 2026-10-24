import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Points a test run's AI settings at nothing real: fake keys override any shell
 * key, the Anthropic base URL is cleared, and usage records go to a temp file
 * instead of the repo's own usage log.
 */
export function hardenAiEnvironment(): void {
  process.env.ANTHROPIC_API_KEY = "vitest-fake-key";
  // The Anthropic SDK reads this: a shell value would send requests past the fetch guard's host list.
  delete process.env.ANTHROPIC_BASE_URL;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "vitest-fake-key";
  process.env.AI_USAGE_FILE = path.join(
    mkdtempSync(path.join(tmpdir(), "vitest-ai-usage-")),
    "usage.jsonl",
  );
}
