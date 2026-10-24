import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoServerEnv } from "../../e2e/real-ai-env";

let dir: string;
let keyFile: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "demo-env-"));
  keyFile = path.join(dir, "key.local");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the paid demo's server environment", () => {
  it("hands the server the key file's key, one usage file and one run id", () => {
    // Given a key file and a different key exported in the shell
    writeFileSync(keyFile, "ANTHROPIC_API_KEY=file-key\n");
    const env: Record<string, string | undefined> = {
      ANTHROPIC_API_KEY: "shell-key",
    };

    // When
    const serverEnv = buildDemoServerEnv(keyFile, env, "/repo");

    // Then the file wins, and the paths and id are fixed
    expect(serverEnv.ANTHROPIC_API_KEY).toBe("file-key");
    expect(serverEnv.AI_USAGE_FILE).toBe("/repo/tmp/ai-usage.jsonl");
    expect(serverEnv.AI_USAGE_RUN_ID).toBe(env.AI_USAGE_RUN_ID);
    expect(env.AI_USAGE_RUN_ID).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // And a second call keeps the same run id
    expect(buildDemoServerEnv(keyFile, env, "/repo").AI_USAGE_RUN_ID).toBe(
      serverEnv.AI_USAGE_RUN_ID,
    );
  });

  it("tags the run demo and pins Anthropic's address over a shell value", () => {
    writeFileSync(keyFile, "ANTHROPIC_API_KEY=file-key\n");
    const serverEnv = buildDemoServerEnv(
      keyFile,
      { ANTHROPIC_BASE_URL: "https://elsewhere.example/v1" },
      "/repo",
    );
    expect(serverEnv.AI_USAGE_ENV).toBe("demo");
    expect(serverEnv.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com/v1");
  });

  it("asks for the Gemini key instead when the provider is gemini", () => {
    writeFileSync(keyFile, "GOOGLE_GENERATIVE_AI_API_KEY=g-key\n");
    const serverEnv = buildDemoServerEnv(
      keyFile,
      { AI_IMPORT_PROVIDER: "gemini" },
      "/repo",
    );
    expect(serverEnv.GOOGLE_GENERATIVE_AI_API_KEY).toBe("g-key");
  });

  it("fails with the file and variable named when the key is missing", () => {
    writeFileSync(keyFile, "OTHER=1\n");
    expect(() => buildDemoServerEnv(keyFile, {}, "/repo")).toThrow(
      new RegExp(`${keyFile}.*ANTHROPIC_API_KEY`),
    );
    expect(() =>
      buildDemoServerEnv(path.join(dir, "nope"), {}, "/repo"),
    ).toThrow(/nope.*missing/);
  });
});
