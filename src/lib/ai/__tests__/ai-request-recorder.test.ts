import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiAiClient } from "../ai-client";
import {
  AiProviderName,
  createAiRequestRecorder,
} from "../ai-request-recorder";
import { ImportAiClient } from "../import-ai-client";

const FAKE_KEY = "recorder-test-secret-key";
const DOCUMENT_TEXT = "1. Exam text that must never be recorded";
const REPLY_TEXT = "Reply question text that must never be recorded";

let exporter: InMemorySpanExporter;
let usageFile: string;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  exporter = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    }),
  );
  usageFile = path.join(
    await mkdtemp(path.join(tmpdir(), "ai-usage-")),
    "usage.jsonl",
  );
  vi.stubEnv("AI_IMPORT_PROVIDER", "gemini");
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", FAKE_KEY);
  vi.stubEnv("AI_USAGE_FILE", usageFile);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  exporter.reset();
  trace.disable();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  logSpy.mockRestore();
});

/** Stubs `fetch` with a canned Gemini `generateContent` reply. */
function stubGeminiReply(
  payload: unknown = {
    questions: [{ title: "Q1", content: REPLY_TEXT, type: "free_text" }],
  },
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  text: JSON.stringify(payload),
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 11,
          candidatesTokenCount: 7,
          thoughtsTokenCount: 3,
          totalTokenCount: 21,
        },
        modelVersion: "gemini-served-version",
        responseId: "resp-123",
      }),
    ),
  );
}

describe("AI request recording", () => {
  it("records one request with model, tokens, outcome and key fingerprint, and never the key or exam text", async () => {
    // Given a Gemini import read that answers normally
    stubGeminiReply();

    // When the owner's import runs
    await new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

    // Then a request span is a child of the import span
    const spans = exporter.getFinishedSpans();
    const importSpan = spans.find(
      (s) => s.name === "import.parseQuestionsFromText",
    );
    const requestSpans = spans.filter((s) => s.name === "ai.provider.request");
    expect(requestSpans).toHaveLength(1);
    const [request] = requestSpans;
    expect(request.parentSpanContext?.spanId).toBe(
      importSpan?.spanContext().spanId,
    );

    // And it carries the call's facts
    const fingerprint = createHash("sha256")
      .update(FAKE_KEY)
      .digest("hex")
      .slice(0, 8);
    expect(request.attributes).toMatchObject({
      "gen_ai.provider.name": "gcp.gemini",
      "server.address": "generativelanguage.googleapis.com",
      "gen_ai.request.model": "gemini-3.5-flash",
      "gen_ai.response.model": "gemini-served-version",
      "gen_ai.usage.input_tokens": 11,
      "gen_ai.usage.output_tokens": 7,
      "http.response.status_code": 200,
      "lms.ai.attempt": 1,
      "lms.ai.key_fingerprint": fingerprint,
    });
    expect(request.attributes["lms.ai.duration_ms"]).toEqual(
      expect.any(Number),
    );

    // And one log line and one usage-file line say the same
    const logged = logSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((line: string) => line.startsWith("ai_request "));
    expect(logged).toHaveLength(1);
    const fileLines = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(fileLines).toHaveLength(1);
    expect(JSON.parse(fileLines[0])).toMatchObject({
      provider: "gcp.gemini",
      model_served: "gemini-served-version",
      key_fingerprint: fingerprint,
      status: 200,
      attempt: 1,
    });

    // And no recorded surface contains the key, the exam text or the reply
    const everything = JSON.stringify([
      requestSpans.map((s) => s.attributes),
      logged,
      fileLines,
    ]);
    for (const secret of [FAKE_KEY, DOCUMENT_TEXT, REPLY_TEXT]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("records every attempt of a failing request with its status, and the read still fails", async () => {
    // Given the provider answers 503 every time (retry-after-ms keeps the SDK's retries fast)
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "overloaded" } }), {
            status: 503,
            headers: { "retry-after-ms": "1" },
          }),
      ),
    );

    // When the import runs
    const read = new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

    // Then the read still fails
    await expect(read).rejects.toThrow();

    // And each attempt has its own record with the failing status
    const records = (await readFile(usageFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.map((r) => [r.attempt, r.status, r.outcome])).toEqual([
      [1, 503, "http_error"],
      [2, 503, "http_error"],
      [3, 503, "http_error"],
    ]);
  });

  it("records a request that never got a reply as a network error, and the read fails with the original error", async () => {
    // Given the connection fails before any reply
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket closed");
      }),
    );

    // When the import runs
    const read = new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

    // Then the original error surfaces
    await expect(read).rejects.toThrow("socket closed");

    // And the attempt is recorded without a status
    const lines = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({ attempt: 1, outcome: "network_error" });
    expect(record.status).toBeUndefined();
  });

  it("reads an Anthropic reply: request id header, served model, thinking tokens and stop reason", async () => {
    // Given an Anthropic Messages reply
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            id: "msg_1",
            model: "claude-served",
            stop_reason: "refusal",
            stop_details: { category: "bio" },
            usage: {
              input_tokens: 40,
              output_tokens: 9,
              output_tokens_details: { thinking_tokens: 5 },
            },
          },
          { headers: { "request-id": "req_abc" } },
        ),
      ),
    );
    const recorder = createAiRequestRecorder({
      span: trace.getTracer("lms").startSpan("import"),
      provider: AiProviderName.Anthropic,
      operation: "import.parseQuestionsFromText",
    });

    // When a request goes through the recorder
    await recorder.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": FAKE_KEY },
      body: JSON.stringify({ model: "claude-requested", messages: [] }),
    });

    // Then the record carries the Anthropic fields
    const [line] = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(JSON.parse(line)).toMatchObject({
      provider: "anthropic",
      host: "api.anthropic.com",
      model_requested: "claude-requested",
      model_served: "claude-served",
      request_id: "req_abc",
      input_tokens: 40,
      output_tokens: 9,
      thinking_tokens: 5,
      finish_reason: "refusal",
      stop_category: "bio",
    });
  });

  it("writes no usage file on Vercel, where the disk is not the owner's", async () => {
    // Given a Vercel run
    vi.stubEnv("VERCEL", "1");
    stubGeminiReply();

    // When the import runs
    await new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

    // Then the log line is written but no file
    expect(
      logSpy.mock.calls.some((c: unknown[]) =>
        String(c[0]).startsWith("ai_request "),
      ),
    ).toBe(true);
    await expect(readFile(usageFile, "utf8")).rejects.toThrow("ENOENT");
  });

  it("warns and still returns the questions when the usage file cannot be written", async () => {
    // Given a usage path that cannot be created (its parent is a file)
    const unwritable = path.join(usageFile, "nested", "usage.jsonl");
    vi.stubEnv("AI_USAGE_FILE", unwritable);
    await writeFile(usageFile, "");
    stubGeminiReply();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // When the import runs
    const questions = await new ImportAiClient().parseQuestionsFromText(
      DOCUMENT_TEXT,
    );

    // Then the read succeeds and the failure is reported on stderr
    expect(questions).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(unwritable),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it.each([
    [{ VERCEL_ENV: "production" }, "production", false],
    [{ VERCEL_ENV: "preview" }, "preview", false],
    [{ E2E_MOCK_AI: "1" }, "e2e-mock", true],
    [{ E2E_MOCK_AI: "0", AI_USAGE_ENV: "demo" }, "demo", false],
    [{}, "local", false],
  ])(
    "tags a record made outside Vitest under %j as %s (mock: %s)",
    async (env, environment, mock) => {
      // Given a run that is not a Vitest run, with this environment
      vi.stubEnv("VITEST", "");
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      vi.stubEnv("AI_USAGE_RUN_ID", "run-42");
      stubGeminiReply();

      // When the import runs
      await new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

      // Then the record names the environment, the mock flag and the run
      const [line] = (await readFile(usageFile, "utf8")).trim().split("\n");
      const record = JSON.parse(line);
      expect(record).toMatchObject({ environment, run_id: "run-42" });
      expect(record.mock === true).toBe(mock);
    },
  );

  it.each([
    [{ VERCEL_ENV: "production" }],
    [{ E2E_MOCK_AI: "1" }],
    [{ E2E_MOCK_AI: "0", AI_USAGE_ENV: "demo" }],
    [{}],
  ])(
    "tags every record made under Vitest as test, whatever else is set: %j",
    async (env) => {
      // Given a Vitest run that also has deploy or mock variables set
      for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
      stubGeminiReply();

      // When the import runs
      await new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

      // Then the record is a test record and not a mock or real one
      const [line] = (await readFile(usageFile, "utf8")).trim().split("\n");
      const record = JSON.parse(line);
      expect(record.environment).toBe("test");
      expect(record.mock).toBeUndefined();
    },
  );

  it("records no key fingerprint for a request sent without a key header", async () => {
    // Given a request with no key header, and one with an empty key header
    stubGeminiReply();
    const recorder = createAiRequestRecorder({
      span: trace.getTracer("test").startSpan("operation"),
      provider: AiProviderName.Gemini,
      operation: "test.keyless",
    });
    const url =
      "https://generativelanguage.googleapis.com/v1beta/x:generateContent";

    // When both are sent
    await recorder.fetch(url, { method: "POST", body: "{}" });
    await recorder.fetch(url, {
      method: "POST",
      body: "{}",
      headers: { "x-goog-api-key": "" },
    });

    // Then neither record names a key
    const lines = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(JSON.parse(line)).not.toHaveProperty("key_fingerprint");
    }
  });

  it("records grading requests too, under the grading operation", async () => {
    // Given a grading reply
    stubGeminiReply({
      grades: [{ questionId: "q1", score: 80, feedback: "Good" }],
    });

    // When a batch is graded
    await new GeminiAiClient().gradeFreeTextBatch([
      { questionId: "q1", questionContent: "Sum", studentAnswer: "x" },
    ]);

    // Then the record names the grading operation
    const [line] = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(JSON.parse(line)).toMatchObject({
      operation: "gemini.gradeFreeTextBatch",
      provider: "gcp.gemini",
    });
  });

  it("records a Claude import read with its served model, request id and thinking tokens, and never the key", async () => {
    // Given Claude is the import provider and answers a Messages request
    vi.stubEnv("AI_IMPORT_PROVIDER", "");
    vi.stubEnv("ANTHROPIC_API_KEY", FAKE_KEY);
    const sent = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent(init.body);
        return Response.json(
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "claude-served",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  questions: [
                    { title: "Q1", content: REPLY_TEXT, type: "free_text" },
                  ],
                }),
              },
            ],
            stop_reason: "end_turn",
            usage: {
              input_tokens: 30,
              output_tokens: 8,
              output_tokens_details: { thinking_tokens: 4 },
            },
          },
          { headers: { "request-id": "req_xyz" } },
        );
      }),
    );

    // When the import runs
    await new ImportAiClient().parseQuestionsFromText(DOCUMENT_TEXT);

    // Then one Anthropic record carries the call's facts
    const lines = (await readFile(usageFile, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      provider: "anthropic",
      host: "api.anthropic.com",
      model_requested: "claude-sonnet-5-5",
      model_served: "claude-served",
      request_id: "req_xyz",
      input_tokens: 30,
      output_tokens: 8,
      thinking_tokens: 4,
      finish_reason: "end_turn",
      key_fingerprint: createHash("sha256")
        .update(FAKE_KEY)
        .digest("hex")
        .slice(0, 8),
    });
    expect(lines[0]).not.toContain(FAKE_KEY);

    // And the request asks for neither thinking, effort nor server-side fallbacks
    const body = String(sent.mock.calls[0][0]);
    expect(body).not.toContain('"thinking"');
    expect(body).not.toContain('"effort"');
    expect(body).not.toContain('"fallbacks"');
  });
});

/**
 * Builds an Anthropic recorder over a stubbed `fetch`.
 * @param respond - What the stubbed `fetch` does for the request.
 * @returns The recorder to send a request through.
 */
function anthropicRecorder(respond: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(respond));
  return createAiRequestRecorder({
    span: trace.getTracer("lms").startSpan("import"),
    provider: AiProviderName.Anthropic,
    operation: "import.parseQuestionsFromText",
  });
}

/** Reads the usage file as parsed records. */
async function readUsageRecords(): Promise<Record<string, unknown>[]> {
  return (await readFile(usageFile, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("AI request recording when a request is cut short", () => {
  it.each([
    ["AbortError", "aborted"],
    ["TimeoutError", "timeout"],
  ])(
    "records a %s before any reply as %s, and the caller sees the original error",
    async (name, outcome) => {
      // Given the request is cut off before a reply
      const cutOff = new DOMException("signal cut", name);
      const recorder = anthropicRecorder(async () => {
        throw cutOff;
      });

      // When a request goes through the recorder
      const sent = recorder.fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        body: "{}",
      });

      // Then the original error surfaces
      await expect(sent).rejects.toBe(cutOff);

      // And exactly one record carries the outcome
      const records = await readUsageRecords();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ outcome });
    },
  );

  it("records a reply whose body fails mid-read once, ends its span, and the read still fails", async () => {
    // Given headers arrive but the body stream times out mid-read
    const timeout = new DOMException("signal timed out", "TimeoutError");
    const recorder = anthropicRecorder(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(timeout);
        },
      });
      return new Response(body, { status: 200 });
    });

    // When a request goes through the recorder and the caller reads the body
    const response = await recorder.fetch(
      "https://api.anthropic.com/v1/messages",
      { method: "POST", body: "{}" },
    );

    // Then the caller's own read fails
    await expect(response.text()).rejects.toBe(timeout);

    // And exactly one record carries the status and the timeout outcome
    const records = await readUsageRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 200, outcome: "timeout" });
    expect(records[0].input_tokens).toBeUndefined();

    // And the request span was ended
    expect(
      exporter
        .getFinishedSpans()
        .filter((s) => s.name === "ai.provider.request"),
    ).toHaveLength(1);
  });
});

describe("AI request recording of reply details", () => {
  it("records why Gemini blocked a prompt", async () => {
    // Given Gemini rejects the prompt itself
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          promptFeedback: { blockReason: "PROHIBITED_CONTENT" },
          usageMetadata: { promptTokenCount: 5 },
        }),
      ),
    );
    const recorder = createAiRequestRecorder({
      span: trace.getTracer("lms").startSpan("import"),
      provider: AiProviderName.Gemini,
      operation: "import.parseQuestionsFromText",
    });

    // When the request goes through the recorder
    await recorder.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent",
      { method: "POST", body: "{}" },
    );

    // Then the record names the block reason
    const [record] = await readUsageRecords();
    expect(record).toMatchObject({ block_reason: "PROHIBITED_CONTENT" });
  });

  it("records Anthropic cache token counts and whether the request sent fallbacks", async () => {
    // Given a Claude reply that read from the prompt cache
    const recorder = anthropicRecorder(async () =>
      Response.json({
        model: "claude-served",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 4,
          output_tokens: 2,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 60,
        },
      }),
    );

    // When a request that asks for server-side fallbacks goes through
    await recorder.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "m", fallbacks: [{ model: "other" }] }),
    });

    // Then the record carries the cache counts and the fallbacks flag
    const [record] = await readUsageRecords();
    expect(record).toMatchObject({
      cache_read_tokens: 900,
      cache_creation_tokens: 60,
      fallbacks_requested: true,
    });
  });

  it("leaves fallbacks_requested false for a request without fallbacks", async () => {
    // Given a plain Claude request
    const recorder = anthropicRecorder(async () =>
      Response.json({ usage: { input_tokens: 1, output_tokens: 1 } }),
    );

    // When it goes through the recorder
    await recorder.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "m" }),
    });

    // Then the flag is false
    const [record] = await readUsageRecords();
    expect(record).toMatchObject({ fallbacks_requested: false });
  });

  it("ignores reply fields of the wrong type instead of recording them", async () => {
    // Given a reply whose token count is not a number
    const recorder = anthropicRecorder(async () =>
      Response.json({
        model: "claude-served",
        usage: { input_tokens: "many", output_tokens: 3 },
      }),
    );

    // When the request goes through the recorder
    await recorder.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: "{}",
    });

    // Then the record is still written, without the malformed count
    const records = await readUsageRecords();
    expect(records).toHaveLength(1);
    expect(records[0].input_tokens).toBeUndefined();

    // And the well-formed fields beside it are kept
    expect(records[0]).toMatchObject({
      model_served: "claude-served",
      output_tokens: 3,
    });
  });

  it("keeps the other reply fields when Claude sends null for optional ones", async () => {
    // Given a reply that nulls the fields it has nothing to say for
    const recorder = anthropicRecorder(async () =>
      Response.json({
        model: "claude-served",
        stop_reason: "end_turn",
        stop_sequence: null,
        stop_details: null,
        usage: {
          input_tokens: 7,
          output_tokens: 5,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
          output_tokens_details: null,
        },
      }),
    );

    // When the request goes through the recorder
    await recorder.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: "{}",
    });

    // Then the nulls do not drop the model and token counts
    const records = await readUsageRecords();
    expect(records[0]).toMatchObject({
      model_served: "claude-served",
      input_tokens: 7,
      output_tokens: 5,
      finish_reason: "end_turn",
    });

    // And no null reaches the written record
    expect(Object.values(records[0])).not.toContain(null);
  });

  it("keeps the other reply fields when Gemini sends null for optional ones", async () => {
    // Given a Gemini reply with null block data and thinking count
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          modelVersion: "gemini-served",
          promptFeedback: null,
          usageMetadata: {
            promptTokenCount: 9,
            candidatesTokenCount: 4,
            thoughtsTokenCount: null,
          },
        }),
      ),
    );
    const recorder = createAiRequestRecorder({
      span: trace.getTracer("lms").startSpan("import"),
      provider: AiProviderName.Gemini,
      operation: "import.parseQuestionsFromText",
    });

    // When the request goes through the recorder
    await recorder.fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/m:generateContent",
      { method: "POST", body: "{}" },
    );

    // Then the model and token counts survive
    const [record] = await readUsageRecords();
    expect(record).toMatchObject({
      model_served: "gemini-served",
      input_tokens: 9,
      output_tokens: 4,
    });
  });
});
