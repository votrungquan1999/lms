import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  RetryError,
} from "ai";
import { RefusalError, UnfinishedReplyError } from "./ai-call-telemetry";
import { AiFailureCause } from "./ai-failure-messages";
import { ImportProviderSettingError } from "./import-ai-client";

/**
 * Sorts a thrown AI error into the cause a teacher can act on.
 * @param error - Whatever the AI call threw.
 * @returns The teacher-facing cause.
 */
export function classifyAiFailure(error: unknown): AiFailureCause {
  // A RetryError only says the SDK gave up; its last attempt says why.
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  // `AbortSignal.timeout` rejects with a TimeoutError DOMException.
  if (
    cause instanceof Error &&
    (cause.name === "TimeoutError" || cause.name === "AbortError")
  ) {
    return AiFailureCause.Timeout;
  }
  if (
    LoadAPIKeyError.isInstance(cause) ||
    cause instanceof ImportProviderSettingError
  ) {
    return AiFailureCause.KeyConfig;
  }
  if (cause instanceof RefusalError) return AiFailureCause.Refusal;
  if (cause instanceof UnfinishedReplyError) {
    const { finishReason } = cause.summary;
    if (finishReason === "length") return AiFailureCause.OutputCap;
    if (finishReason === "content-filter") return AiFailureCause.Refusal;
  }
  if (NoObjectGeneratedError.isInstance(cause))
    return AiFailureCause.WrongShape;
  if (APICallError.isInstance(cause)) {
    if ([401, 403, 404].includes(cause.statusCode ?? 0)) {
      return AiFailureCause.KeyConfig;
    }
    if (cause.isRetryable) return AiFailureCause.Busy;
  }
  return AiFailureCause.Unknown;
}
