import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { context, type Span, trace } from "@opentelemetry/api";
import { z } from "zod";

/** Provider names as the `gen_ai.provider.name` attribute spells them. */
export enum AiProviderName {
  Gemini = "gcp.gemini",
  Anthropic = "anthropic",
}

/** What one recorder is scoped to: a single AI operation and its span. */
export interface AiRequestRecorderOptions {
  span: Span;
  provider: AiProviderName;
  operation: string;
}

/** A recorder hands the AI SDK a `fetch` that writes one record per request. */
export interface AiRequestRecorder {
  fetch: typeof fetch;
  withReason(reason: string): AiRequestRecorder;
}

/** How a request ended. */
enum AiRequestOutcome {
  Ok = "ok",
  HttpError = "http_error",
  NetworkError = "network_error",
  Aborted = "aborted",
  Timeout = "timeout",
}

/** One provider HTTP request, as written to the span, the log and the usage file. */
interface AiRequestRecord {
  ts: string;
  provider: AiProviderName;
  operation: string;
  host: string;
  model_requested?: string;
  model_served?: string;
  request_id?: string;
  status?: number;
  outcome: AiRequestOutcome;
  attempt: number;
  duration_ms: number;
  key_fingerprint?: string;
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  block_reason?: string;
  fallbacks_requested?: boolean;
  finish_reason?: string;
  stop_category?: string;
  reason?: string;
  environment: string;
  mock?: boolean;
  run_id?: string;
}

/** Header that carries the API key, per provider. */
const KEY_HEADER: Record<AiProviderName, string> = {
  [AiProviderName.Gemini]: "x-goog-api-key",
  [AiProviderName.Anthropic]: "x-api-key",
};

/** Where local runs append records unless `AI_USAGE_FILE` says otherwise. */
const DEFAULT_USAGE_FILE = "tmp/ai-usage.jsonl";

/**
 * Reads one header from any shape the AI SDK may pass to `fetch`.
 * @param headers - A `Headers`, a record or a list of pairs.
 * @param name - The header to read, case-insensitive.
 * @returns The header value, or undefined when absent.
 */
function readHeader(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  return new Headers(headers).get(name) ?? undefined;
}

/**
 * Short, non-reversible id of an API key, so records show which key was used.
 * @param key - The raw key from the request header.
 * @returns First 8 hex chars of its SHA-256, or undefined for a missing key.
 */
function fingerprintKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * Parses a JSON string, tolerating anything else.
 * @param text - Candidate JSON text.
 * @returns The parsed object, or undefined when it is not a JSON object.
 */
function parseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Finds the model a request asks for: Gemini puts it in the URL path,
 * Anthropic in the JSON body.
 * @param url - The request URL.
 * @param body - The request body the SDK sent (a JSON string).
 * @returns The model id, when the request names one.
 */
function requestedModel(url: URL, body: unknown): string | undefined {
  const fromPath = /\/models\/([^/:]+)/.exec(url.pathname)?.[1];
  if (fromPath) return fromPath;
  if (typeof body !== "string") return undefined;
  const model = parseJsonObject(body)?.model;
  return typeof model === "string" ? model : undefined;
}

/**
 * Makes one reply field tolerant on its own: null and a wrong type both become
 * undefined, so a bad field drops only itself and never the whole record.
 * @param schema - The schema for the field when it is well formed.
 * @returns A schema that yields the value or undefined, never null or an error.
 */
function lenient<T extends z.ZodType>(schema: T) {
  return schema
    .nullish()
    .transform((value) => value ?? undefined)
    .catch(undefined);
}

/** The Gemini `generateContent` reply fields the record keeps. */
const geminiReplySchema = z.object({
  modelVersion: lenient(z.string()),
  responseId: lenient(z.string()),
  usageMetadata: lenient(
    z.object({
      promptTokenCount: lenient(z.number()),
      candidatesTokenCount: lenient(z.number()),
      thoughtsTokenCount: lenient(z.number()),
    }),
  ),
  candidates: lenient(z.array(z.object({ finishReason: lenient(z.string()) }))),
  promptFeedback: lenient(z.object({ blockReason: lenient(z.string()) })),
});

/** The Anthropic Messages reply fields the record keeps. */
const anthropicReplySchema = z.object({
  model: lenient(z.string()),
  stop_reason: lenient(z.string()),
  stop_details: lenient(z.object({ category: lenient(z.string()) })),
  usage: lenient(
    z.object({
      input_tokens: lenient(z.number()),
      output_tokens: lenient(z.number()),
      cache_read_input_tokens: lenient(z.number()),
      cache_creation_input_tokens: lenient(z.number()),
      output_tokens_details: lenient(
        z.object({ thinking_tokens: lenient(z.number()) }),
      ),
    }),
  ),
});

/**
 * Reads the Gemini reply fields the record keeps.
 * @param reply - The parsed `generateContent` reply.
 * @returns The served model, id, token counts, finish reason and block reason;
 *   empty when the reply does not match the expected shape.
 */
function readGeminiReply(reply: unknown): Partial<AiRequestRecord> {
  const parsed = geminiReplySchema.safeParse(reply);
  if (!parsed.success) return {};
  const { data } = parsed;
  return {
    model_served: data.modelVersion,
    request_id: data.responseId,
    input_tokens: data.usageMetadata?.promptTokenCount,
    output_tokens: data.usageMetadata?.candidatesTokenCount,
    thinking_tokens: data.usageMetadata?.thoughtsTokenCount,
    finish_reason: data.candidates?.[0]?.finishReason,
    block_reason: data.promptFeedback?.blockReason,
  };
}

/**
 * Reads the Anthropic Messages reply fields the record keeps.
 * @param reply - The parsed Messages reply.
 * @param headers - The response headers (carry the request id).
 * @returns The served model, id, token counts (cache included) and stop
 *   reason; only the request id when the body does not match the shape.
 */
function readAnthropicReply(
  reply: unknown,
  headers: Headers,
): Partial<AiRequestRecord> {
  const request_id = headers.get("request-id") ?? undefined;
  const parsed = anthropicReplySchema.safeParse(reply);
  if (!parsed.success) return { request_id };
  const { data } = parsed;
  return {
    model_served: data.model,
    request_id,
    input_tokens: data.usage?.input_tokens,
    output_tokens: data.usage?.output_tokens,
    thinking_tokens: data.usage?.output_tokens_details?.thinking_tokens,
    cache_read_tokens: data.usage?.cache_read_input_tokens,
    cache_creation_tokens: data.usage?.cache_creation_input_tokens,
    finish_reason: data.stop_reason,
    stop_category: data.stop_details?.category,
  };
}

/**
 * Tells whether a request body asks Anthropic for server-side fallbacks.
 * @param body - The request body the SDK sent (a JSON string).
 * @returns True when the JSON body carries a `fallbacks` field.
 */
function requestsFallbacks(body: unknown): boolean {
  return (
    typeof body === "string" && parseJsonObject(body)?.fallbacks !== undefined
  );
}

/**
 * Classifies an error that cut a request short.
 * @param error - What `fetch` or the body read threw.
 * @returns Aborted for a caller abort, timeout for an elapsed deadline,
 *   otherwise a network error.
 */
function cutShortOutcome(error: unknown): AiRequestOutcome {
  if (!(error instanceof Error)) return AiRequestOutcome.NetworkError;
  if (error.name === "AbortError") return AiRequestOutcome.Aborted;
  if (error.name === "TimeoutError") return AiRequestOutcome.Timeout;
  return AiRequestOutcome.NetworkError;
}

/**
 * Names the environment that made a request, so records from tests and mocks
 * never pass for real traffic.
 * @returns The environment tag and whether the AI reply was mocked.
 */
function runEnvironment(): { environment: string; mock?: boolean } {
  // First: a test run must never pass for deploy, mock or demo traffic, even
  // when its shell has those variables set.
  if (process.env.VITEST) return { environment: "test" };
  if (process.env.VERCEL_ENV) return { environment: process.env.VERCEL_ENV };
  if (process.env.E2E_MOCK_AI === "1") {
    return { environment: "e2e-mock", mock: true };
  }
  if (process.env.AI_USAGE_ENV === "demo") return { environment: "demo" };
  return { environment: "local" };
}

/**
 * Resolves where local runs append records.
 * @returns The absolute usage file path.
 */
function usageFilePath(): string {
  return path.resolve(process.env.AI_USAGE_FILE || DEFAULT_USAGE_FILE);
}

/**
 * Writes one record onto its span, the log and (off Vercel) the usage file.
 * @param span - The request span to fill (the caller ends it).
 * @param record - The finished record.
 * @param attributes - The span attributes derived from the record.
 */
async function emitRecord(
  span: Span,
  record: AiRequestRecord,
  attributes: Record<string, string | number | boolean>,
): Promise<void> {
  span.setAttributes(attributes);
  console.log(`ai_request ${JSON.stringify(record)}`);
  if (process.env.VERCEL) return;
  const file = usageFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`);
}

/**
 * Completes a record from the reply (when there is one) and emits it.
 * The record is always emitted, even when the body cannot be read. Recording
 * must never break the read, so a failed write warns and carries on.
 * @param requestSpan - The request's span, ended here.
 * @param record - The record built so far.
 * @param started - When the request began, in epoch milliseconds.
 * @param reply - A clone of the response, when one arrived.
 */
async function finishRecord(
  requestSpan: Span,
  record: AiRequestRecord,
  started: number,
  reply?: Response,
): Promise<void> {
  try {
    if (reply) {
      let text: string | undefined;
      try {
        text = await reply.text();
      } catch (error) {
        // Headers arrived but the body did not: keep the status, drop the reply fields.
        record.outcome = cutShortOutcome(error);
      }
      const body = text === undefined ? undefined : parseJsonObject(text);
      if (body) {
        Object.assign(
          record,
          record.provider === AiProviderName.Anthropic
            ? readAnthropicReply(body, reply.headers)
            : readGeminiReply(body),
        );
      }
    }
    record.duration_ms = Date.now() - started;
    await emitRecord(requestSpan, record, spanAttributes(record));
  } catch (error) {
    console.warn(
      `ai request recording failed (usage file ${usageFilePath()})`,
      error,
    );
  } finally {
    requestSpan.end();
  }
}

/**
 * Creates the recorder for one AI operation.
 * @param options - The operation's span, provider and name.
 * @returns A recorder whose `fetch` is passed to the provider factory.
 */
export function createAiRequestRecorder(
  options: AiRequestRecorderOptions,
): AiRequestRecorder {
  const counter = { attempts: 0 };
  return buildRecorder(options, counter, undefined);
}

/**
 * Builds a recorder sharing the operation's attempt counter.
 * @param options - The operation's span, provider and name.
 * @param counter - Shared attempt count across reasons.
 * @param reason - Why this fetch sends a request, when not the first read.
 * @returns The recorder.
 */
function buildRecorder(
  options: AiRequestRecorderOptions,
  counter: { attempts: number },
  reason: string | undefined,
): AiRequestRecorder {
  const { span, provider, operation } = options;
  return {
    withReason: (next) => buildRecorder(options, counter, next),
    fetch: async (input, init) => {
      counter.attempts += 1;
      const attempt = counter.attempts;
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      const requestSpan = trace
        .getTracer("lms")
        .startSpan(
          "ai.provider.request",
          {},
          trace.setSpan(context.active(), span),
        );
      const started = Date.now();
      const record: AiRequestRecord = {
        ts: new Date().toISOString(),
        provider,
        operation,
        host: url.host,
        model_requested: requestedModel(url, init?.body),
        outcome: AiRequestOutcome.Ok,
        attempt,
        duration_ms: 0,
        key_fingerprint: fingerprintKey(
          readHeader(init?.headers, KEY_HEADER[provider]),
        ),
        fallbacks_requested:
          provider === AiProviderName.Anthropic
            ? requestsFallbacks(init?.body)
            : undefined,
        reason,
        ...runEnvironment(),
        run_id: process.env.AI_USAGE_RUN_ID || undefined,
      };
      let response: Response;
      try {
        response = await globalThis.fetch(input, init);
      } catch (error) {
        // Record the lost request, then let the original error through.
        record.outcome = cutShortOutcome(error);
        await finishRecord(requestSpan, record, started);
        throw error;
      }
      record.status = response.status;
      record.outcome = response.ok
        ? AiRequestOutcome.Ok
        : AiRequestOutcome.HttpError;
      // The clone leaves the body intact for the SDK.
      await finishRecord(requestSpan, record, started, response.clone());
      return response;
    },
  };
}

/**
 * Maps a record onto span attributes, dropping unset fields.
 * @param record - The finished record.
 * @returns Attribute name to value.
 */
function spanAttributes(
  record: AiRequestRecord,
): Record<string, string | number | boolean> {
  const entries: [string, string | number | boolean | undefined][] = [
    ["gen_ai.provider.name", record.provider],
    ["server.address", record.host],
    ["gen_ai.request.model", record.model_requested],
    ["gen_ai.response.model", record.model_served],
    ["gen_ai.response.id", record.request_id],
    ["gen_ai.usage.input_tokens", record.input_tokens],
    ["gen_ai.usage.output_tokens", record.output_tokens],
    ["lms.ai.usage.thinking_tokens", record.thinking_tokens],
    ["gen_ai.usage.cache_read.input_tokens", record.cache_read_tokens],
    ["gen_ai.usage.cache_creation.input_tokens", record.cache_creation_tokens],
    ["lms.ai.finish_reason", record.finish_reason],
    ["lms.ai.block_reason", record.block_reason],
    ["lms.ai.fallbacks_requested", record.fallbacks_requested],
    ["lms.ai.stop_category", record.stop_category],
    ["http.response.status_code", record.status],
    ["lms.ai.outcome", record.outcome],
    ["lms.ai.attempt", record.attempt],
    ["lms.ai.duration_ms", record.duration_ms],
    ["lms.ai.key_fingerprint", record.key_fingerprint],
    ["lms.ai.reason", record.reason],
    ["lms.ai.environment", record.environment],
    ["lms.ai.run_id", record.run_id],
  ];
  return Object.fromEntries(
    entries.filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined,
    ),
  );
}
