import type { Span } from "@opentelemetry/api";
import { runEnvironment } from "./ai-request-recorder";
import type { RunnerJob } from "./runner-job-schema";

/** What kind of exchange with the runner an event records. */
export enum RunnerEventKind {
  Create = "create",
  Check = "check",
}

/** How asking the runner to create a job ended. */
export enum RunnerCreateAction {
  Created = "created",
  Unreachable = "unreachable",
  Refused = "refused",
  SettingsError = "settings_error",
}

/** What the LMS did with one status check of a pending job. */
export enum RunnerCheckAction {
  StillWaiting = "still_waiting",
  SkippedUnreachable = "skipped_unreachable",
  SavedSuggestions = "saved_suggestions",
  MarkedFailed = "marked_failed",
  ClaimedElsewhere = "claimed_elsewhere",
}

/** The runner status recorded when a check could not read one. */
export const UNREACHABLE_RUNNER_STATUS = "unreachable";

/** A job create request and how it ended. Holds ids, enums and error names only. */
export interface RunnerCreateEvent {
  at: Date;
  kind: RunnerEventKind.Create;
  action: RunnerCreateAction;
  runnerJobId?: string;
  refusedStatus?: number;
  /** An error name or status label such as `TypeError` or `status_503`, never a message. */
  unreachableCause?: string;
}

/** One status check of a pending job. Holds ids, enums, counts and error names only. */
export interface RunnerCheckEvent {
  at: Date;
  kind: RunnerEventKind.Check;
  runnerJobId: string;
  runnerStatus: string;
  action: RunnerCheckAction;
  savedCount?: number;
  errorKind?: string;
  /** An error name or status label, never a message. */
  unreachableCause?: string;
}

/** One exchange between the LMS and the runner. */
export type RunnerEvent = RunnerCreateEvent | RunnerCheckEvent;

/** One model's usage entry within a runner job. */
type RunnerUsageEntry = NonNullable<RunnerJob["usage"]>[number];

/**
 * Maps an event onto span attributes, dropping unset fields.
 * @param event - What happened.
 * @returns Attribute name to value.
 */
function spanAttributes(event: RunnerEvent): Record<string, string | number> {
  const entries: [string, string | number | undefined][] = [
    ["lms.ai.runner_job_id", event.runnerJobId],
    ["lms.ai.runner.unreachable_cause", event.unreachableCause],
  ];
  if (event.kind === RunnerEventKind.Create) {
    entries.push(
      ["lms.ai.runner.create_outcome", event.action],
      ["lms.ai.runner.refused_status", event.refusedStatus],
    );
  } else {
    entries.push(
      ["lms.ai.runner.status", event.runnerStatus],
      ["lms.ai.runner.action", event.action],
      ["lms.ai.runner.saved_count", event.savedCount],
      ["lms.ai.runner.error_kind", event.errorKind],
    );
  }
  return Object.fromEntries(
    entries.filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    ),
  );
}

/**
 * Records one runner exchange on the span and the `ai_runner` log line.
 * The event carries only enums, ids, counts, status numbers and error names,
 * so nothing sensitive can reach either sink.
 * @param span - The span active while the exchange happened, if any.
 * @param event - What happened.
 */
export function recordRunnerEvent(
  span: Span | undefined,
  event: RunnerEvent,
): void {
  span?.setAttributes(spanAttributes(event));
  const { environment } = runEnvironment();
  const line = {
    at: event.at.toISOString(),
    kind: event.kind,
    action: event.action,
    runner_job_id: event.runnerJobId,
    runner_status:
      event.kind === RunnerEventKind.Check ? event.runnerStatus : undefined,
    refused_status:
      event.kind === RunnerEventKind.Create ? event.refusedStatus : undefined,
    saved_count:
      event.kind === RunnerEventKind.Check ? event.savedCount : undefined,
    error_kind:
      event.kind === RunnerEventKind.Check ? event.errorKind : undefined,
    unreachable_cause: event.unreachableCause,
    environment,
  };
  console.log(`ai_runner ${JSON.stringify(line)}`);
}

/**
 * Sums a finished job's usage into span attributes under the names the AI request recorder uses.
 * @param usage - The job's `usage` entries, when the runner reported any.
 * @returns Attribute name to value; empty when there is no usage.
 */
export function runnerUsageAttributes(
  usage: RunnerJob["usage"],
): Record<string, string | number> {
  if (!usage?.length) return {};
  const sum = (pick: (entry: RunnerUsageEntry) => number | null | undefined) =>
    usage.reduce((total, entry) => total + (pick(entry) ?? 0), 0);
  const models = [
    ...new Set(usage.flatMap((entry) => (entry.model ? [entry.model] : []))),
  ];
  const attributes: Record<string, string | number> = {
    "gen_ai.usage.input_tokens": sum((e) => e.inputTokens),
    "gen_ai.usage.output_tokens": sum((e) => e.outputTokens),
    "gen_ai.usage.cache_read.input_tokens": sum((e) => e.cacheReadInputTokens),
    "gen_ai.usage.cache_creation.input_tokens": sum(
      (e) => e.cacheCreationInputTokens,
    ),
    "lms.ai.usage.thinking_tokens": sum((e) => e.thinkingTokens),
    "lms.ai.runner.cost_usd": sum((e) => e.costUSD),
  };
  if (models.length) attributes["gen_ai.response.model"] = models.join(",");
  return attributes;
}
