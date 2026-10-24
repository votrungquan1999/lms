import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportAiClient } from "../import-ai-client";

const REPLY_TITLE = "Re-read question";

let exporter: InMemorySpanExporter;
let usageFile: string;
let requestBodies: string[];
let requestHeaders: Headers[];

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
  vi.stubEnv("AI_IMPORT_PROVIDER", "");
  vi.stubEnv("CLAUDE_MODEL_ID", "");
  vi.stubEnv("AI_USAGE_FILE", usageFile);
  vi.spyOn(console, "log").mockImplementation(() => {});
  requestBodies = [];
  requestHeaders = [];
});

afterEach(() => {
  exporter.reset();
  trace.disable();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A Claude Messages reply that declined to answer. */
function refusalReply(category: string) {
  return Response.json({
    id: "msg_refused",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [],
    stop_reason: "refusal",
    stop_details: { type: "refusal", category },
    usage: { input_tokens: 100, output_tokens: 0 },
  });
}

/** A Claude Messages reply carrying one valid question. */
function answerReply() {
  return Response.json({
    id: "msg_answered",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          questions: [
            {
              title: REPLY_TITLE,
              content: "What is 2 + 2?",
              type: "free_text",
            },
          ],
        }),
      },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 120, output_tokens: 30 },
  });
}

/**
 * Stubs `fetch` to answer each request with the next reply, keeping bodies.
 * @param replies - Builders for the replies, in request order.
 */
function stubReplies(replies: (() => Response)[]): void {
  const queue = [...replies];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requestBodies.push(String(init.body));
      requestHeaders.push(new Headers(init.headers));
      const next = queue.shift();
      if (!next) throw new Error("unexpected extra request");
      return next();
    }),
  );
}

/** Reads the usage file as parsed records. */
async function readRecords(): Promise<Record<string, unknown>[]> {
  const text = await readFile(usageFile, "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("Claude import refusal", () => {
  it("reads a refused document once more on Haiku 4.5, and records both requests", async () => {
    // Given Sonnet declines the document and Haiku answers
    stubReplies([() => refusalReply("bio"), answerReply]);

    // When the document is read
    const questions = await new ImportAiClient().parseQuestionsFromText(
      "1. A biology exam",
    );

    // Then the teacher gets Haiku's drafts
    expect(questions.map((q) => q.title)).toEqual([REPLY_TITLE]);

    // And both requests are recorded, the second tagged as the re-read
    const records = await readRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      model_requested: "claude-sonnet-5-5",
      finish_reason: "refusal",
      stop_category: "bio",
      attempt: 1,
    });
    expect(records[1]).toMatchObject({
      model_requested: "claude-haiku-4-5",
      reason: "refusal_retry",
      attempt: 2,
    });

    // And no request asks Anthropic for its server-side fallback
    expect(requestBodies).toHaveLength(2);
    for (const body of requestBodies) expect(body).not.toContain("fallbacks");
    for (const headers of requestHeaders) {
      expect(headers.get("anthropic-beta") ?? "").not.toContain("fallback");
    }

    // And the import's token totals add up both requests
    const importSpan = exporter
      .getFinishedSpans()
      .find((s) => s.name === "import.parseQuestionsFromText");
    expect(importSpan?.attributes).toMatchObject({
      "gen_ai.usage.input_tokens": 220,
      "gen_ai.usage.output_tokens": 30,
    });
  });

  it("fails the read when the re-read is refused too, naming the category on the span", async () => {
    // Given both models decline
    stubReplies([() => refusalReply("bio"), () => refusalReply("cyber")]);

    // When the document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

    // Then the read fails after exactly two requests
    await expect(read).rejects.toThrow("AI refused to answer");
    expect(requestBodies).toHaveLength(2);

    // And the span records a refusal with the last category and both requests' tokens
    const importSpan = exporter
      .getFinishedSpans()
      .find((s) => s.name === "import.parseQuestionsFromText");
    expect(importSpan?.attributes).toMatchObject({
      "error.type": "refusal",
      "lms.ai.refusal_category": "cyber",
      "gen_ai.usage.input_tokens": 200,
    });
  });

  it("counts the refused request's tokens when the re-read then stops for another reason", async () => {
    // Given Sonnet refuses and Haiku's re-read is cut off at the output cap
    stubReplies([
      () => refusalReply("bio"),
      () =>
        Response.json({
          id: "msg_cut",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [{ type: "text", text: '{"questions":[' }],
          stop_reason: "max_tokens",
          usage: { input_tokens: 120, output_tokens: 64 },
        }),
    ]);

    // When the document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

    // Then the read fails as an unfinished reply
    await expect(read).rejects.toThrow("AI reply did not finish");

    // And the span's token totals add up both requests, not just the re-read
    const importSpan = exporter
      .getFinishedSpans()
      .find((s) => s.name === "import.parseQuestionsFromText");
    expect(importSpan?.attributes).toMatchObject({
      "error.type": "bad_reply",
      "gen_ai.usage.input_tokens": 220,
      "gen_ai.usage.output_tokens": 64,
    });
  });

  it("counts the refused request's tokens when the re-read fails with a provider error", async () => {
    // Given Sonnet refuses and the Haiku re-read is rejected as a bad request
    stubReplies([
      () => refusalReply("bio"),
      () =>
        Response.json(
          {
            type: "error",
            error: { type: "invalid_request_error", message: "bad request" },
          },
          { status: 400 },
        ),
    ]);

    // When the document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

    // Then the provider's own error comes through
    await expect(read).rejects.toThrow("bad request");

    // And the span still counts the refused request's tokens
    const importSpan = exporter
      .getFinishedSpans()
      .find((s) => s.name === "import.parseQuestionsFromText");
    expect(importSpan?.attributes).toMatchObject({
      "error.type": "provider_error",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 0,
    });
  });

  it.each(["bio", "cyber", "reasoning_extraction"])(
    "re-reads once after a %s refusal",
    async (category) => {
      // Given Sonnet refuses for this category and Haiku answers
      stubReplies([() => refusalReply(category), answerReply]);

      // When the document is read
      const questions = await new ImportAiClient().parseQuestionsFromText(
        "1. An exam",
      );

      // Then Haiku's drafts come back after two requests
      expect(questions).toHaveLength(1);
      expect(requestBodies).toHaveLength(2);
      expect(requestBodies[1]).toContain("claude-haiku-4-5");
    },
  );

  it("does not re-read when the read already used Haiku", async () => {
    // Given Haiku is the configured model and refuses
    vi.stubEnv("CLAUDE_MODEL_ID", "claude-haiku-4-5");
    stubReplies([() => refusalReply("bio")]);

    // When the document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

    // Then the read fails after one request
    await expect(read).rejects.toThrow("AI refused to answer");
    expect(requestBodies).toHaveLength(1);
  });

  it("still re-reads when the refusal leaves exactly 10 seconds of the read's time budget", async () => {
    // Given the refused request used all but 10 s of the 240 s budget
    vi.useFakeTimers({ toFake: ["Date"] });
    stubReplies([
      () => {
        vi.setSystemTime(Date.now() + 230_000);
        return refusalReply("bio");
      },
      answerReply,
    ]);

    // When the document is read
    const questions = await new ImportAiClient().parseQuestionsFromText(
      "1. A biology exam",
    );

    // Then Haiku re-reads it
    expect(questions.map((q) => q.title)).toEqual([REPLY_TITLE]);
    expect(requestBodies).toHaveLength(2);
  });

  it("never re-reads a Gemini read that a safety filter stopped", async () => {
    // Given Gemini is the provider and its filter blocks the reply
    vi.stubEnv("AI_IMPORT_PROVIDER", "gemini");
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "gemini-test-key");
    stubReplies([
      () =>
        Response.json({
          candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0 },
        }),
    ]);

    // When the document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

    // Then the read fails after one request
    await expect(read).rejects.toThrow(
      "AI reply did not finish (content-filter)",
    );
    expect(requestBodies).toHaveLength(1);
  });

  it("re-reads a single refused question the same way", async () => {
    // Given Sonnet refuses a question re-read and Haiku answers
    stubReplies([
      () => refusalReply("bio"),
      () =>
        Response.json({
          id: "msg_q",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                question: {
                  title: REPLY_TITLE,
                  content: "What is 2 + 2?",
                  type: "free_text",
                },
              }),
            },
          ],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
    ]);

    // When one question is re-read
    const question = await new ImportAiClient().retryQuestion(
      "1. An exam",
      { title: "Q", content: "c", type: "free_text" },
      "fix it",
    );

    // Then Haiku's question comes back
    expect(question.title).toBe(REPLY_TITLE);
    expect(requestBodies).toHaveLength(2);
  });
});
