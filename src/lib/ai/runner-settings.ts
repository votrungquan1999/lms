import { z } from "zod";
import type { BackgroundClaudeRunnerClient } from "./background-claude-runner-client";

/** Outcome kinds of reading the runner settings from the environment. */
export enum RunnerSettingsKind {
  Disabled = "disabled",
  Enabled = "enabled",
  Invalid = "invalid",
}

/** Outcome kinds of resolving the runner client for one grading round or check. */
export enum RunnerClientResolutionKind {
  Disabled = "disabled",
  Ready = "ready",
  Invalid = "invalid",
}

/** Where the runner lives and the service key that opens it. */
export interface RunnerSettings {
  url: string;
  key: string;
}

/** The runner settings read from the environment, or why there are none. */
export type RunnerSettingsResolution =
  | { kind: RunnerSettingsKind.Disabled }
  | { kind: RunnerSettingsKind.Enabled; settings: RunnerSettings }
  | { kind: RunnerSettingsKind.Invalid; variable: string };

/** The runner client a round can use, or why it cannot. */
export type RunnerClientResolution =
  | { kind: RunnerClientResolutionKind.Disabled }
  | {
      kind: RunnerClientResolutionKind.Ready;
      client: BackgroundClaudeRunnerClient;
    }
  | { kind: RunnerClientResolutionKind.Invalid; variable: string };

/** Resolves the runner client at the moment a round or check runs, never at service construction. */
export type RunnerClientProvider = () => RunnerClientResolution;

/** A runner setting holds a value the LMS cannot use; names the variable, never its value. */
export class RunnerSettingsError extends Error {
  constructor(variable: string) {
    super(`${variable} is not a usable runner setting`);
    this.name = "RunnerSettingsError";
  }
}

const runnerUrlSchema = z.url().startsWith("https://");

/**
 * Wraps a client as a ready resolution.
 * @param client - The runner client to hand to a round.
 */
export function ready(
  client: BackgroundClaudeRunnerClient,
): RunnerClientResolution {
  return { kind: RunnerClientResolutionKind.Ready, client };
}

/**
 * Reads the runner settings per call so a run can switch without a restart.
 * Disabled when no service key is set; Invalid names the offending variable
 * only, so a bad value is never echoed.
 * @returns The settings, or why there are none.
 */
export function runnerSettings(): RunnerSettingsResolution {
  const key = process.env.BCR_SERVICE_KEY;
  if (!key) return { kind: RunnerSettingsKind.Disabled };

  const url = runnerUrlSchema.safeParse(process.env.BCR_URL);
  if (!url.success) {
    return { kind: RunnerSettingsKind.Invalid, variable: "BCR_URL" };
  }
  return {
    kind: RunnerSettingsKind.Enabled,
    settings: { url: url.data.replace(/\/+$/, ""), key },
  };
}
