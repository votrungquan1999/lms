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
  Unknown = "unknown",
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

/**
 * Summarizes a failed call. A `RetryError` is unwrapped to its last attempt's
 * cause, since the wrapper itself says nothing about what went wrong.
 * @param error - Whatever the call threw.
 * @returns The failure's summary.
 */
function summarizeFailure(error: unknown): AiCallSummary {
  if (RetryError.isInstance(error)) {
    return {
      errorType: classifyAiError(error.lastError),
      attempts: error.errors.length,
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
 * call's own summary on success, one derived from the error on failure. A
 * record-and-rethrow boundary: the original error always propagates.
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
    span.setAttributes(toAttributes(summarizeFailure(error)));
    throw error;
  }
  span.setAttributes(toAttributes(outcome.summary));
  return outcome.value;
}
