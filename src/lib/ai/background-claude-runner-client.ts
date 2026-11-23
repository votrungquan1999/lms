import { withSpan } from "src/lib/observability/with-span";
import { runnerCreateReplyTextSchema } from "./runner-job-schema";
import type { RunnerSettings } from "./runner-settings";

/** Outcome kinds of asking the runner to create a job. */
export enum RunnerCreateOutcomeKind {
  Created = "created",
  Unreachable = "unreachable",
  Refused = "refused",
}

/** What the runner did with a create request. */
export type RunnerCreateOutcome =
  | { kind: RunnerCreateOutcomeKind.Created; jobId: string }
  | { kind: RunnerCreateOutcomeKind.Unreachable; cause: string }
  | { kind: RunnerCreateOutcomeKind.Refused; cause: string };

/** Request timeouts in milliseconds; injectable because fake timers do not drive `AbortSignal.timeout`. */
export interface RunnerTimeouts {
  create: number;
  read: number;
}

/** Collaborators a test can replace. */
export interface RunnerClientOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: RunnerTimeouts;
}

const DEFAULT_TIMEOUTS: RunnerTimeouts = { create: 15_000, read: 5_000 };
const NETWORK_ERROR_NAMES = new Set([
  "TypeError",
  "TimeoutError",
  "AbortError",
]);

/** Talks to the owner's background Claude runner over HTTP. */
export class BackgroundClaudeRunnerClient {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: RunnerTimeouts;

  /**
   * @param settings - The runner address and service key.
   * @param options - Replaceable fetch and timeouts.
   */
  constructor(
    private readonly settings: RunnerSettings,
    options: RunnerClientOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUTS;
  }

  /**
   * Asks the runner to start a grading job.
   * @param prompt - The full grading prompt.
   * @returns The typed outcome; never the key, URL or body.
   */
  async createJob(prompt: string): Promise<RunnerCreateOutcome> {
    return withSpan(
      "runner.createJob",
      { "gen_ai.provider.name": "background-claude-runner" },
      async (span) => {
        const outcome = await this.postJob(prompt);
        span.setAttribute("lms.ai.runner.create_outcome", outcome.kind);
        if (outcome.kind === RunnerCreateOutcomeKind.Created) {
          span.setAttribute("lms.ai.runner_job_id", outcome.jobId);
        } else {
          span.setAttribute("lms.ai.runner.unreachable_cause", outcome.cause);
        }
        return outcome;
      },
    );
  }

  /**
   * Sends the create request and classifies the answer.
   * @param prompt - The full grading prompt.
   */
  private async postJob(prompt: string): Promise<RunnerCreateOutcome> {
    let response: Response;
    // The feature's intentional error boundary: only network and timeout failures
    // become an outcome; anything else (e.g. the test fetch guard) rethrows loudly.
    try {
      response = await this.fetchImpl(`${this.settings.url}/api/jobs`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.settings.key}`,
          "content-type": "application/json",
        },
        // A redirect is a status to classify, never followed.
        redirect: "manual",
        body: JSON.stringify({ prompt, options: { model: "sonnet" } }),
        signal: AbortSignal.timeout(this.timeoutMs.create),
      });
    } catch (error) {
      if (error instanceof Error && NETWORK_ERROR_NAMES.has(error.name)) {
        return {
          kind: RunnerCreateOutcomeKind.Unreachable,
          cause: error.name,
        };
      }
      throw error;
    }

    if (response.status !== 201) {
      return {
        kind: RunnerCreateOutcomeKind.Unreachable,
        cause: `status_${response.status}`,
      };
    }
    const reply = runnerCreateReplyTextSchema.safeParse(await response.text());
    if (!reply.success) {
      return { kind: RunnerCreateOutcomeKind.Unreachable, cause: "bad_body" };
    }
    return { kind: RunnerCreateOutcomeKind.Created, jobId: reply.data.id };
  }
}
