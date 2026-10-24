import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hardenAiEnvironment } from "../../../tests/harden-ai-environment";
import { GeminiAiClient } from "../ai-client";

const FAKE_KEY_FINGERPRINT = createHash("sha256")
  .update("vitest-fake-key")
  .digest("hex")
  .slice(0, 8);

/** Reads the test run's usage file as parsed records. */
async function readRecords(): Promise<Record<string, unknown>[]> {
  const usageFile = process.env.AI_USAGE_FILE;
  expect(usageFile).toBeTruthy();
  const text = await readFile(usageFile as string, "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

beforeEach(async () => {
  await rm(process.env.AI_USAGE_FILE as string, { force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI providers in test runs", () => {
  it("overwrites keys and the usage file a shell already set", () => {
    // Given a shell that exports real-looking keys and its own usage file
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "shell-google-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "shell-anthropic-key");
    vi.stubEnv("AI_USAGE_FILE", "/shell/usage.jsonl");

    // When the test run's environment hardening runs
    hardenAiEnvironment();

    // Then every one is replaced by the fake key or a temp file
    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe("vitest-fake-key");
    expect(process.env.ANTHROPIC_API_KEY).toBe("vitest-fake-key");
    expect(process.env.AI_USAGE_FILE).not.toBe("/shell/usage.jsonl");
    expect(process.env.AI_USAGE_FILE).toContain("vitest-ai-usage-");
  });

  it("refuses to reach a real provider and records the blocked request with the fake key's fingerprint", async () => {
    // Given a test that wires nothing: no mocked SDK, no stubbed fetch

    // When the real grading client runs
    const grading = new GeminiAiClient().gradeFreeTextBatch([
      { questionId: "q1", questionContent: "Sum", studentAnswer: "x" },
    ]);

    // Then the request is blocked before leaving the machine
    await expect(grading).rejects.toThrow(
      "Blocked request to AI provider generativelanguage.googleapis.com",
    );

    // And exactly one usage record shows the blocked request under the test environment
    const records = await readRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      host: "generativelanguage.googleapis.com",
      outcome: "network_error",
      environment: "test",
      key_fingerprint: FAKE_KEY_FINGERPRINT,
    });
  });
});
