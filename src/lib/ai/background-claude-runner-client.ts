import { withSpan } from "src/lib/observability/with-span";
import type { z } from "zod";
import {
  jsonTextAs,
  type RunnerJob,
  type RunnerJobStatus,
  runnerCreateReplyTextSchema,
  runnerJobSchema,
  runnerJobStatusReplySchema,
} from "./runner-job-schema";
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

/** Outcome kinds of reading a job from the runner. */
export enum RunnerReadOutcomeKind {
  Found = "found",
  NotFound = "not_found",
  Refused = "refused",
  Unreachable = "unreachable",
}

/** What the runner answered to a read of a job. */
export type RunnerReadOutcome<T> =
  | { kind: RunnerReadOutcomeKind.Found; body: T }
  | { kind: RunnerReadOutcomeKind.NotFound }
  | { kind: RunnerReadOutcomeKind.Refused; status: number }
  | { kind: RunnerReadOutcomeKind.Unreachable; cause: string };

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
   * Reads only the job's status.
   * @param jobId - The runner's job id.
   * @returns The typed outcome; never the key, URL or body.
   */
  async readStatus(
    jobId: string,
  ): Promise<RunnerReadOutcome<{ status: RunnerJobStatus }>> {
    return withSpan(
      "runner.readStatus",
      { "lms.ai.runner_job_id": jobId },
      async (span) => {
        const outcome = await this.getJob(
          `${jobId}?view=status`,
          runnerJobStatusReplySchema,
        );
        span.setAttribute("lms.ai.runner.read_outcome", outcome.kind);
        return outcome;
      },
    );
  }

  /**
   * Reads the full job, including its result.
   * @param jobId - The runner's job id.
   * @returns The typed outcome; never the key, URL or body.
   */
  async readJob(jobId: string): Promise<RunnerReadOutcome<RunnerJob>> {
    return withSpan(
      "runner.readJob",
      { "lms.ai.runner_job_id": jobId },
      async (span) => {
        const outcome = await this.getJob(jobId, runnerJobSchema);
        span.setAttribute("lms.ai.runner.read_outcome", outcome.kind);
        return outcome;
      },
    );
  }

  /**
   * Sends a read and classifies the answer; a render can never throw on it.
   * @param path - The job path below `/api/jobs/`, with any query.
   * @param schema - The shape a readable body must have.
   */
  private async getJob<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<RunnerReadOutcome<z.infer<T>>> {
    let response: Response;
    // Same boundary as the create: only network and timeout failures become an outcome.
    try {
      response = await this.fetchImpl(`${this.settings.url}/api/jobs/${path}`, {
        method: "GET",
        headers: { authorization: `Bearer ${this.settings.key}` },
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs.read),
      });
    } catch (error) {
      if (error instanceof Error && NETWORK_ERROR_NAMES.has(error.name)) {
        return {
          kind: RunnerReadOutcomeKind.Unreachable,
          cause: error.name,
        };
      }
      throw error;
    }

    if (response.status === 404)
      return { kind: RunnerReadOutcomeKind.NotFound };
    if (response.status === 401 || response.status === 403) {
      return { kind: RunnerReadOutcomeKind.Refused, status: response.status };
    }
    if (response.status !== 200) {
      return {
        kind: RunnerReadOutcomeKind.Unreachable,
        cause: `status_${response.status}`,
      };
    }
    const body = jsonTextAs(schema).safeParse(await response.text());
    if (!body.success) {
      return { kind: RunnerReadOutcomeKind.Unreachable, cause: "bad_body" };
    }
    return { kind: RunnerReadOutcomeKind.Found, body: body.data };
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
