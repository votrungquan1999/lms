import type { Attributes, Span } from "@opentelemetry/api";
import {
  APICallError,
  JSONParseError,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { ZodError } from "zod";

/** Why an AI call failed — a small fixed set Grafana can group by. */
export enum AiErrorType {
  Timeout = "timeout",
  RateLimit = "rate_limit",
  Auth = "auth",
  ProviderError = "provider_error",
  BadReply = "bad_reply",
  Refusal = "refusal",
  Unknown = "unknown",
}

/**
 * The model answered but stopped before finishing (output cap, filter), so
 * there is no output to read. Carries what the span should still record.
 */
export class UnfinishedReplyError extends Error {
  readonly summary: AiCallSummary;

  /**
   * @param results - Every result the read produced, in order; the last one
   *   did not finish.
   */
  constructor(results: AiCallResult[]) {
    const last = results[results.length - 1];
    super(`AI reply did not finish (${last.finishReason})`);
    this.name = "UnfinishedReplyError";
    this.summary = summarizeResults(results);
  }
}

/**
 * Claude declined to answer, and no re-read could (or did) get an answer.
 * Carries what the span should still record.
 */
export class RefusalError extends Error {
  readonly category?: string;
  readonly summary: AiCallSummary;

  /**
   * @param category - The refusal category Claude reported, if any.
   * @param results - Every result the read produced, in order.
   */
  constructor(category: string | undefined, results: AiCallResult[]) {
    super(`AI refused to answer${category ? ` (${category})` : ""}`);
    this.name = "RefusalError";
    this.category = category;
    this.summary = summarizeResults(results);
  }
}

/**
 * Throws when a resolved result stopped for any reason other than finishing.
 * Must run before `result.output` is read, which throws without the reason.
 * @param result - What `generateText` resolved to.
 * @param earlier - Results of earlier requests in the same read, so their
 *   tokens still count when this one fails.
 */
export function assertReplyFinished(
  result: AiCallResult,
  earlier: AiCallResult[] = [],
): void {
  if (result.finishReason && result.finishReason !== "stop") {
    throw new UnfinishedReplyError([...earlier, result]);
  }
}

/**
 * Everything recorded about one AI call, built once and written onto its span
 * in a single place. Never holds prompt or reply text (no-PII policy).
 */
export interface AiCallSummary {
  errorType?: AiErrorType;
  /** Network attempts the SDK made; only known when its retries gave up. */
  attempts?: number;
  finishReason?: string;
  /** Why Claude declined to answer, when it did. */
  refusalCategory?: string;
  responseModel?: string;
  replyLength?: number;
  /** `path: message` per failed field — never the offending value. */
  validationIssues?: string[];
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  /** Batch calls only: how the reply's ids lined up with the ids asked for. */
  itemsReturned?: number;
  missingIds?: number;
  unknownIds?: number;
  duplicateIds?: number;
  /** Document reads only: questions found; 0 means the teacher got nothing. */
  questionsReturned?: number;
  /** Full document reads only: distinct pictures the document marks. */
  picturesInDocument?: number;
  /** Full document reads only: of those, pictures a draft uses. */
  picturesAttached?: number;
  /** Full document reads only: of those, pictures no draft uses. */
  picturesUnused?: number;
}

/** The parts of a `generateText` result the summary reads. */
export interface AiCallResult {
  finishReason: string;
  response?: { modelId?: string };
  usage?: LanguageModelUsage;
}

/** What a successful call hands back: its value plus its summary. */
export interface AiCallOutcome<T> {
  value: T;
  summary: AiCallSummary;
}

/** Span attribute name for each summary field. */
const ATTRIBUTE_NAMES: Record<keyof AiCallSummary, string> = {
  errorType: "error.type",
  attempts: "lms.ai.attempts",
  finishReason: "lms.ai.finish_reason",
  refusalCategory: "lms.ai.refusal_category",
  responseModel: "gen_ai.response.model",
  replyLength: "lms.ai.reply_length",
  validationIssues: "lms.ai.validation_issues",
  inputTokens: "gen_ai.usage.input_tokens",
  outputTokens: "gen_ai.usage.output_tokens",
  reasoningTokens: "lms.ai.usage.reasoning_tokens",
  cachedInputTokens: "lms.ai.usage.cached_input_tokens",
  totalTokens: "lms.ai.usage.total_tokens",
  itemsReturned: "lms.ai.items_returned",
  missingIds: "lms.ai.missing_ids",
  unknownIds: "lms.ai.unknown_ids",
  duplicateIds: "lms.ai.duplicate_ids",
  questionsReturned: "lms.ai.questions_returned",
  picturesInDocument: "lms.ai.pictures_in_document",
  picturesAttached: "lms.ai.pictures_attached",
  picturesUnused: "lms.ai.pictures_unused",
};

/** Keeps a span readable when a reply fails on every item. */
const MAX_VALIDATION_ISSUES = 10;

/**
 * Maps a thrown error to its {@link AiErrorType}.
 * @param error - Whatever `generateText` (or our own parsing) threw.
 * @returns The error category.
 */
function classifyAiError(error: unknown): AiErrorType {
  // `AbortSignal.timeout` rejects fetch with a TimeoutError DOMException.
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return AiErrorType.Timeout;
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return AiErrorType.RateLimit;
    if (error.statusCode === 401 || error.statusCode === 403)
      return AiErrorType.Auth;
    return AiErrorType.ProviderError;
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    return AiErrorType.BadReply;
  }
  return AiErrorType.Unknown;
}

/**
 * Lists which fields of a reply failed the schema. Only Zod's path and
 * message are kept; the SDK's own error message embeds the whole reply.
 * @param cause - The `cause` of a `NoObjectGeneratedError`.
 * @returns One `path: message` entry per failed field, or none.
 */
function describeValidationIssues(cause: unknown): string[] {
  if (JSONParseError.isInstance(cause)) return ["reply is not valid JSON"];
  if (!TypeValidationError.isInstance(cause)) return [];
  if (!(cause.cause instanceof ZodError)) return [];
  return cause.cause.issues
    .slice(0, MAX_VALIDATION_ISSUES)
    .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`);
}

/**
 * Picks the token counts worth tracking for cost out of the SDK's usage.
 * @param usage - The call's usage, when the SDK reported one.
 * @returns The token fields of the summary.
 */
function summarizeUsage(usage: LanguageModelUsage | undefined): AiCallSummary {
  return {
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens,
    cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens,
    totalTokens: usage?.totalTokens,
  };
}

/**
 * Summarizes a call that took several requests (a refused read and its
 * re-read): stop reason and model of the last, token totals of all.
 * @param results - Every result the call produced, in order.
 * @returns The last result's summary with summed token fields.
 */
export function summarizeResults(results: AiCallResult[]): AiCallSummary {
  const last = results[results.length - 1];
  const parts = results.map((result) => summarizeUsage(result.usage));
  const total = (field: keyof AiCallSummary) =>
    parts.reduce<number | undefined>((sum, part) => {
      const value = part[field];
      return typeof value === "number" ? (sum ?? 0) + value : sum;
    }, undefined);
  return {
    ...summarizeResult(last),
    inputTokens: total("inputTokens"),
    outputTokens: total("outputTokens"),
    reasoningTokens: total("reasoningTokens"),
    cachedInputTokens: total("cachedInputTokens"),
    totalTokens: total("totalTokens"),
  };
}

/**
 * Summarizes a successful call from the SDK's result.
 * @param result - What `generateText` resolved to.
 * @returns The stop reason, model and token fields of the summary.
 */
export function summarizeResult(result: AiCallResult): AiCallSummary {
  return {
    finishReason: result.finishReason,
    responseModel: result.response?.modelId,
    ...summarizeUsage(result.usage),
  };
}

/**
 * Compares the ids a batch reply returned against the ids asked for.
 * @param requestedIds - One id per item sent to the model.
 * @param returnedIds - One id per item in the reply, in reply order.
 * @returns Counts of returned, missing, invented and repeated ids.
 */
export function summarizeIdMatch(
  requestedIds: string[],
  returnedIds: string[],
): AiCallSummary {
  const requested = new Set(requestedIds);
  const returned = new Set(returnedIds);
  return {
    itemsReturned: returnedIds.length,
    missingIds: [...requested].filter((id) => !returned.has(id)).length,
    unknownIds: [...returned].filter((id) => !requested.has(id)).length,
    duplicateIds: returnedIds.length - returned.size,
  };
}

/** Results of earlier requests, keyed by the error a later request threw. */
const earlierResultsByError = new WeakMap<object, AiCallResult[]>();

/**
 * Remembers earlier requests of a read on the error a later request threw, so
 * the span still counts their tokens. The error itself is not changed.
 * @param error - What the later request threw.
 * @param earlier - Results of the requests that came before it.
 * @returns The same error, to rethrow.
 */
export function keepEarlierResults(
  error: unknown,
  earlier: AiCallResult[],
): unknown {
  if (typeof error === "object" && error !== null) {
    earlierResultsByError.set(error, earlier);
  }
  return error;
}

/**
 * Adds the token counts of earlier requests to a failure's summary.
 * @param summary - The failure's own summary.
 * @param earlier - Results of requests made before the failing one.
 * @returns The summary with summed token fields.
 */
function addEarlierTokens(
  summary: AiCallSummary,
  earlier: AiCallResult[],
): AiCallSummary {
  const before = summarizeResults(earlier);
  const sum = (field: keyof AiCallSummary) => {
    const a = summary[field];
    const b = before[field];
    if (typeof a === "number" && typeof b === "number") return a + b;
    return typeof a === "number" ? a : b;
  };
  return {
    ...summary,
    inputTokens: sum("inputTokens") as number | undefined,
    outputTokens: sum("outputTokens") as number | undefined,
    reasoningTokens: sum("reasoningTokens") as number | undefined,
    cachedInputTokens: sum("cachedInputTokens") as number | undefined,
    totalTokens: sum("totalTokens") as number | undefined,
  };
}

/**
 * Summarizes a failed call, counting the tokens of requests made before it.
 * @param error - Whatever the call threw.
 * @returns The failure's summary.
 */
function summarizeFailure(error: unknown): AiCallSummary {
  const summary = summarizeOwnFailure(error);
  const earlier =
    typeof error === "object" && error !== null
      ? earlierResultsByError.get(error)
      : undefined;
  return earlier ? addEarlierTokens(summary, earlier) : summary;
}

/**
 * Summarizes a failed call. A `RetryError` is unwrapped to its last attempt's
 * cause, since the wrapper itself says nothing about what went wrong.
 * @param error - Whatever the call threw.
 * @returns The failure's summary.
 */
function summarizeOwnFailure(error: unknown): AiCallSummary {
  if (RetryError.isInstance(error)) {
    return {
      errorType: classifyAiError(error.lastError),
      attempts: error.errors.length,
    };
  }
  if (error instanceof RefusalError) {
    return {
      ...error.summary,
      errorType: AiErrorType.Refusal,
      refusalCategory: error.category,
    };
  }
  if (error instanceof UnfinishedReplyError) {
    return {
      ...error.summary,
      errorType: AiErrorType.BadReply,
    };
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    // The model did answer, so its usage and stop reason are still known.
    return {
      errorType: AiErrorType.BadReply,
      finishReason: error.finishReason,
      responseModel: error.response?.modelId,
      replyLength: error.text?.length,
      validationIssues: describeValidationIssues(error.cause),
      ...summarizeUsage(error.usage),
    };
  }
  return { errorType: classifyAiError(error) };
}

/**
 * Flattens a summary into span attributes, skipping absent fields.
 * @param summary - The call's summary.
 * @returns The attributes to set.
 */
function toAttributes(summary: AiCallSummary): Attributes {
  const attributes: Attributes = {};
  for (const [field, name] of Object.entries(ATTRIBUTE_NAMES)) {
    const value = summary[field as keyof AiCallSummary];
    if (value !== undefined) {
      attributes[name] = value;
    }
  }
  return attributes;
}

/**
 * Runs one AI call and writes its summary onto `span` exactly once — the
 * call's own summary on success, one derived from the error on failure (also
 * logged, never with reply text). A record-and-rethrow boundary: the original
 * error always propagates.
 * @param span - The call's span.
 * @param run - The call itself, returning its value and summary.
 * @returns The call's value.
 */
export async function recordAiCall<T>(
  span: Span,
  run: () => Promise<AiCallOutcome<T>>,
): Promise<T> {
  let outcome: AiCallOutcome<T>;
  try {
    outcome = await run();
  } catch (error) {
    const summary = summarizeFailure(error);
    span.setAttributes(toAttributes(summary));
    // Local `next dev` exports traces only when `.env.local` sets the OTLP endpoint, so the log says why too.
    console.error(`AI call failed: ${JSON.stringify(summary)}`);
    throw error;
  }
  span.setAttributes(toAttributes(outcome.summary));
  return outcome.value;
}
