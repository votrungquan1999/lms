import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** The variables the show-me run's dev server needs from the config. */
export interface RunnerServerEnv {
  [name: string]: string;
}

/** Where the runner lives and the key that opens it, as the env file holds them. */
export interface RunnerEnvFileValues {
  url: string;
  key: string;
}

/**
 * Reads the runner address and service key from the gitignored env file.
 * Parsed, never loaded into the shell, and the key is never printed.
 * @param envFile - The gitignored file holding `BCR_URL` and `BCR_SERVICE_KEY`.
 * @returns The two values.
 * @throws When the file or either value is missing, before any server boots.
 */
export function readRunnerEnvFile(envFile: string): RunnerEnvFileValues {
  if (!fs.existsSync(envFile)) {
    throw new Error(
      `${envFile} is missing — create it with BCR_URL=<runner url> and BCR_SERVICE_KEY=<service key>.`,
    );
  }
  const values = parseEnv(fs.readFileSync(envFile, "utf8"));
  const url = values.BCR_URL;
  const key = values.BCR_SERVICE_KEY;
  if (!url) throw new Error(`${envFile} has no BCR_URL value.`);
  if (!key) throw new Error(`${envFile} has no BCR_SERVICE_KEY value.`);
  return { url, key };
}

/**
 * Builds the environment the show-me run's dev server starts with.
 * @param envFile - The gitignored file holding the runner address and key.
 * @param env - The config process's environment; gets the run id set once.
 * @param repoRoot - Where `tmp/ai-usage.jsonl` lives.
 * @returns The explicit server env, including the file's own values.
 */
export function buildRunnerDemoServerEnv(
  envFile: string,
  env: Record<string, string | undefined>,
  repoRoot: string,
): RunnerServerEnv {
  const { url, key } = readRunnerEnvFile(envFile);

  // Playwright evaluates the config in the main process and in each worker;
  // `??=` keeps one id across them, so the run file name matches the server's.
  env.AI_USAGE_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, "-");
  return {
    BCR_URL: url,
    BCR_SERVICE_KEY: key,
    AI_USAGE_RUN_ID: env.AI_USAGE_RUN_ID,
    AI_USAGE_ENV: "demo",
    // Absolute: the server's cwd and the spec's directory differ.
    AI_USAGE_FILE: path.join(repoRoot, "tmp", "ai-usage.jsonl"),
  };
}
