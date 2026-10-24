import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** The variables the paid demo's dev server needs from the config. */
export interface DemoServerEnv {
  [name: string]: string;
}

/**
 * Builds the environment the demo's dev server starts with.
 * @param keyFile - The gitignored file holding the provider key.
 * @param env - The config process's environment; gets the run id set once.
 * @param repoRoot - Where `tmp/ai-usage.jsonl` lives.
 * @returns The explicit server env, including the file's own key.
 */
export function buildDemoServerEnv(
  keyFile: string,
  env: Record<string, string | undefined>,
  repoRoot: string,
): DemoServerEnv {
  // Fail before booting a server — a missing prerequisite would otherwise
  // surface minutes later as an unrelated-looking UI timeout.
  if (!fs.existsSync(keyFile)) {
    throw new Error(
      `${keyFile} is missing — create it with ${keyVariable(env)}=<real key>.`,
    );
  }
  // Parsed, not loaded: a key exported in the shell must not win over the file,
  // or the records' key fingerprint would not match the file.
  const fileValues = parseEnv(fs.readFileSync(keyFile, "utf8"));
  const variable = keyVariable(env);
  const key = fileValues[variable];
  if (!key) throw new Error(`${keyFile} has no ${variable} value.`);

  // Playwright evaluates the config in the main process and in each worker;
  // `??=` keeps one id across them.
  env.AI_USAGE_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, "-");
  return {
    [variable]: key,
    AI_USAGE_RUN_ID: env.AI_USAGE_RUN_ID,
    // Records say "demo", and a shell-exported base URL cannot reroute the paid run.
    AI_USAGE_ENV: "demo",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
    // Absolute: the server's cwd and the spec's directory differ.
    AI_USAGE_FILE: path.join(repoRoot, "tmp", "ai-usage.jsonl"),
  };
}

/**
 * Names the key variable the chosen import provider reads.
 * @param env - The config process's environment.
 * @returns The Gemini key name for `gemini`, otherwise Claude's.
 */
function keyVariable(env: Record<string, string | undefined>): string {
  return env.AI_IMPORT_PROVIDER === "gemini"
    ? "GOOGLE_GENERATIVE_AI_API_KEY"
    : "ANTHROPIC_API_KEY";
}
