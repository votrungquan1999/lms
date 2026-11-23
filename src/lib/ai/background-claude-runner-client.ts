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
  | {
      kind: RunnerCreateOutcomeKind.Refused;
      status: number;
      cause?: "bad_body";
    };

/** The runner refused to create a job; carries the status only, never a body or URL. */
export class RunnerRefusedError extends Error {
  /**
   * @param status - The HTTP status the runner answered.
   */
  constructor(readonly status: number) {
    super(`Runner refused job create: ${status}`);
    this.name = "RunnerRefusedError";
  }
}

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

/** A completed exchange: the status, plus the body text when the caller asked for it for that status. */
interface RunnerExchange {
  status: number;
  text: string | null;
}

/** An exchange that failed at the network level or ran past its time limit. */
interface RunnerExchangeFailure {
  failed: true;
  cause: string;
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
        } else if (outcome.kind === RunnerCreateOutcomeKind.Refused) {
          span.setAttribute("lms.ai.runner.refused_status", outcome.status);
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
    const exchange = await this.exchange(
      `${this.settings.url}/api/jobs/${path}`,
      {
        method: "GET",
        headers: { authorization: `Bearer ${this.settings.key}` },
      },
      this.timeoutMs.read,
      (status) => status === 200,
    );
    if ("failed" in exchange) {
      return { kind: RunnerReadOutcomeKind.Unreachable, cause: exchange.cause };
    }
    const response = exchange;

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
    const body = jsonTextAs(schema).safeParse(response.text ?? "");
    if (!body.success) {
      return { kind: RunnerReadOutcomeKind.Unreachable, cause: "bad_body" };
    }
    return { kind: RunnerReadOutcomeKind.Found, body: body.data };
  }

  /**
   * Sends one request and, when wanted, reads its body, all under one time limit.
   * The time limit also covers the body, so a runner that sends headers and then
   * stalls ends as a failure here instead of throwing out of the caller.
   * This is the feature's intentional error boundary: only network and timeout
   * failures become a result; anything else (e.g. the test fetch guard) rethrows loudly.
   * @param url - The full request URL.
   * @param init - Method, headers and body; redirects and the signal are set here.
   * @param timeoutMs - The limit for the whole answer.
   * @param wantsBody - Whether the body text is needed for this status.
   */
  private async exchange(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    wantsBody: (status: number) => boolean,
  ): Promise<RunnerExchange | RunnerExchangeFailure> {
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        // A redirect is a status to classify, never followed.
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = wantsBody(response.status) ? await response.text() : null;
      return { status: response.status, text };
    } catch (error) {
      if (error instanceof Error && NETWORK_ERROR_NAMES.has(error.name)) {
        return { failed: true, cause: error.name };
      }
      throw error;
    }
  }

  /**
   * Sends the create request and classifies the answer.
   * @param prompt - The full grading prompt.
   */
  private async postJob(prompt: string): Promise<RunnerCreateOutcome> {
    const exchange = await this.exchange(
      `${this.settings.url}/api/jobs`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.settings.key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt, options: { model: "sonnet" } }),
      },
      this.timeoutMs.create,
      (status) => status === 201,
    );
    if ("failed" in exchange) {
      return {
        kind: RunnerCreateOutcomeKind.Unreachable,
        cause: exchange.cause,
      };
    }
    const response = exchange;

    // A 5xx may mean the runner never stored the job, so Gemini can still grade it.
    if (response.status >= 500) {
      return {
        kind: RunnerCreateOutcomeKind.Unreachable,
        cause: `status_${response.status}`,
      };
    }
    // Any other non-201 is the runner declining; a 2xx or 201 we cannot read may
    // still hold a stored job, so grading on Gemini too would double-grade.
    if (response.status !== 201) {
      return {
        kind: RunnerCreateOutcomeKind.Refused,
        status: response.status,
      };
    }
    const reply = runnerCreateReplyTextSchema.safeParse(response.text ?? "");
    if (!reply.success) {
      return {
        kind: RunnerCreateOutcomeKind.Refused,
        status: response.status,
        cause: "bad_body",
      };
    }
    return { kind: RunnerCreateOutcomeKind.Created, jobId: reply.data.id };
  }
}
