import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRunUsageTotals } from "../ai-usage-file";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ai-usage-"));
  file = path.join(dir, "usage.jsonl");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function record(fields: Record<string, unknown>): string {
  return JSON.stringify({
    ts: "2026-10-24T00:00:00.000Z",
    provider: "anthropic",
    operation: "import",
    outcome: "ok",
    environment: "demo",
    key_fingerprint: "abcd1234",
    ...fields,
  });
}

describe("totalling one run's usage records", () => {
  it("sums only the asked run, per served model, and counts bad lines", () => {
    // Given records from two runs, a refusal re-read on Haiku, and junk
    writeFileSync(
      file,
      [
        record({
          run_id: "run-a",
          model_requested: "claude-sonnet-5-5",
          model_served: "claude-sonnet-5-5",
          input_tokens: 1000,
          output_tokens: 200,
          thinking_tokens: 50,
        }),
        record({
          run_id: "run-a",
          model_requested: "claude-sonnet-5-5",
          model_served: "claude-sonnet-5-5",
          input_tokens: 500,
          output_tokens: 100,
        }),
        record({
          run_id: "run-a",
          reason: "refusal_retry",
          model_requested: "claude-haiku-4-5",
          model_served: "claude-haiku-4-5",
          input_tokens: 700,
          output_tokens: 80,
        }),
        record({
          run_id: "run-b",
          model_served: "claude-sonnet-5-5",
          input_tokens: 9999,
          output_tokens: 9999,
        }),
        record({ input_tokens: 5, output_tokens: 5 }),
        "not json",
        "",
      ].join("\n"),
    );

    // When
    const totals = readRunUsageTotals(file, "run-a");

    // Then
    expect(totals.requests).toBe(3);
    expect(totals.malformedLines).toBe(1);
    expect(totals.environments).toEqual(["demo"]);
    expect(totals.fingerprints).toEqual(["abcd1234"]);
    expect(totals.perModel).toEqual([
      {
        modelServed: "claude-sonnet-5-5",
        modelRequested: "claude-sonnet-5-5",
        requests: 2,
        inputTokens: 1500,
        outputTokens: 300,
        thinkingTokens: 50,
      },
      {
        modelServed: "claude-haiku-4-5",
        modelRequested: "claude-haiku-4-5",
        requests: 1,
        inputTokens: 700,
        outputTokens: 80,
        thinkingTokens: 0,
      },
    ]);
  });

  it("returns empty totals for an unknown, empty or file-less run", () => {
    writeFileSync(file, record({ model_served: "m", input_tokens: 1 }));
    for (const [f, id] of [
      [file, "nope"],
      [file, ""],
      [path.join(dir, "missing.jsonl"), "run-a"],
    ] as const) {
      const totals = readRunUsageTotals(f, id);
      expect(totals.requests).toBe(0);
      expect(totals.perModel).toEqual([]);
    }
  });

  it("stays free of OTel and Next imports so the Playwright spec can load it", () => {
    const source = readFileSync(
      path.join(__dirname, "..", "ai-usage-file.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/@opentelemetry|from "next|from "\.\//);
  });
});
