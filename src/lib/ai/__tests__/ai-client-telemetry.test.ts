import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  APICallError,
  JSONParseError,
  NoObjectGeneratedError,
  RetryError,
  TypeValidationError,
} from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/google", () => ({
  google: () => "stub-model",
}));

// Keep the SDK's real error classes; only the network call is stubbed.
const generateTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

import { GeminiAiClient } from "../ai-client";
import { aiGradeBatchSchema } from "../grading-schema";

let exporter: InMemorySpanExporter;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    }),
  );
  generateTextMock.mockReset();
});

afterEach(() => {
  exporter.reset();
  trace.disable();
});

const gradeItem = {
  questionId: "q1",
  questionContent: "Sum a list",
  studentAnswer: "def total(nums): pass",
};

const parsedQuestion = {
  title: "Q1",
  content: "What is 2 + 2?",
  type: "free_text" as const,
};

describe("GeminiAiClient telemetry", () => {
  it("gives every Gemini call a 120-second total limit so a hung call ends as a recorded error", async () => {
    generateTextMock.mockResolvedValue({
      usage: {},
      output: {
        grades: [{ questionId: "q1", score: 50, feedback: "ok" }],
        questions: [parsedQuestion],
        question: parsedQuestion,
      },
    });
    const client = new GeminiAiClient();

    await client.gradeFreeTextBatch([gradeItem]);
    await client.parseQuestionsFromText("doc text");
    await client.retryQuestion("doc text", parsedQuestion, "wrong answer");

    expect(generateTextMock).toHaveBeenCalledTimes(3);
    for (const [options] of generateTextMock.mock.calls) {
      expect(options).toMatchObject({ timeout: 120_000 });
    }
  });

  it("labels a call cut off by the time limit as a timeout and still throws", async () => {
    // What fetch rejects with when `AbortSignal.timeout` fires.
    const timeout = new DOMException("signal timed out", "TimeoutError");
    generateTextMock.mockRejectedValue(timeout);

    await expect(
      new GeminiAiClient().gradeFreeTextBatch([gradeItem]),
    ).rejects.toBe(timeout);

    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["error.type"]).toBe("timeout");
  });

  const apiError = (statusCode: number) =>
    new APICallError({
      message: `status ${statusCode}`,
      url: "https://generativelanguage.googleapis.com",
      requestBodyValues: {},
      statusCode,
    });

  it.each([
    {
      name: "rate limit after the SDK's retries ran out",
      error: new RetryError({
        message: "Failed after 3 attempts",
        reason: "maxRetriesExceeded",
        errors: [apiError(429), apiError(429), apiError(429)],
      }),
      errorType: "rate_limit",
      attempts: 3,
    },
    {
      name: "rejected API key",
      error: apiError(403),
      errorType: "auth",
      attempts: undefined,
    },
    {
      name: "Gemini server error after a retry",
      error: new RetryError({
        message: "Failed after 2 attempts",
        reason: "errorNotRetryable",
        errors: [apiError(503), apiError(500)],
      }),
      errorType: "provider_error",
      attempts: 2,
    },
  ])(
    "labels a $name by its cause and records the attempt count",
    async ({ error, errorType, attempts }) => {
      generateTextMock.mockRejectedValue(error);

      await expect(
        new GeminiAiClient().gradeFreeTextBatch([gradeItem]),
      ).rejects.toBe(error);

      const [span] = exporter.getFinishedSpans();
      expect(span?.attributes["error.type"]).toBe(errorType);
      expect(span?.attributes["lms.ai.attempts"]).toBe(attempts);
    },
  );

  it("labels a reply that fails the format check and records why, without any reply text", async () => {
    const reply = {
      grades: [{ questionId: "q1", score: 150, feedback: "PRIVATE-MARKER" }],
    };
    const replyText = JSON.stringify(reply);
    const zodError = aiGradeBatchSchema.safeParse(reply).error;
    const error = new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      cause: new TypeValidationError({ value: reply, cause: zodError }),
      text: replyText,
      response: {
        id: "r1",
        timestamp: new Date(0),
        modelId: "gemini-3.5-flash-001",
      },
      usage: {
        inputTokens: 900,
        inputTokenDetails: {
          noCacheTokens: 900,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: 4000,
        outputTokenDetails: { textTokens: 4000, reasoningTokens: undefined },
        totalTokens: 4900,
      },
      finishReason: "length",
    });
    generateTextMock.mockRejectedValue(error);

    await expect(
      new GeminiAiClient().gradeFreeTextBatch([gradeItem]),
    ).rejects.toBe(error);

    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["error.type"]).toBe("bad_reply");
    expect(span?.attributes["lms.ai.finish_reason"]).toBe("length");
    expect(span?.attributes["lms.ai.reply_length"]).toBe(replyText.length);
    expect(span?.attributes["gen_ai.usage.output_tokens"]).toBe(4000);
    expect(span?.attributes["lms.ai.validation_issues"]).toEqual([
      expect.stringMatching(/^grades\.0\.score: /),
    ]);
    expect(JSON.stringify([span?.attributes, span?.events])).not.toContain(
      "PRIVATE-MARKER",
    );
  });

  it("says a reply was not JSON at all, without any reply text", async () => {
    const replyText = "Sorry, PRIVATE-MARKER cannot be graded";
    const error = new NoObjectGeneratedError({
      message: "No object generated: could not parse the response.",
      cause: new JSONParseError({ text: replyText, cause: new SyntaxError() }),
      text: replyText,
      response: { id: "r1", timestamp: new Date(0), modelId: "m" },
      usage: {
        inputTokens: undefined,
        inputTokenDetails: {
          noCacheTokens: undefined,
          cacheReadTokens: undefined,
          cacheWriteTokens: undefined,
        },
        outputTokens: undefined,
        outputTokenDetails: {
          textTokens: undefined,
          reasoningTokens: undefined,
        },
        totalTokens: undefined,
      },
      finishReason: "stop",
    });
    generateTextMock.mockRejectedValue(error);

    await expect(
      new GeminiAiClient().parseQuestionsFromText("doc text"),
    ).rejects.toBe(error);

    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["error.type"]).toBe("bad_reply");
    expect(span?.attributes["lms.ai.validation_issues"]).toEqual([
      "reply is not valid JSON",
    ]);
    expect(JSON.stringify([span?.attributes, span?.events])).not.toContain(
      "PRIVATE-MARKER",
    );
  });

  it("records one summary of a successful grading call: stop reason, model, token breakdown, and how the grades matched the questions asked", async () => {
    generateTextMock.mockResolvedValue({
      finishReason: "stop",
      response: { modelId: "gemini-3.5-flash-001" },
      usage: {
        inputTokens: 1200,
        inputTokenDetails: {
          noCacheTokens: 200,
          cacheReadTokens: 1000,
          cacheWriteTokens: undefined,
        },
        outputTokens: 700,
        outputTokenDetails: { textTokens: 300, reasoningTokens: 400 },
        totalTokens: 1900,
      },
      output: {
        grades: [
          { questionId: "q1", score: 50, feedback: "ok" },
          { questionId: "q1", score: 60, feedback: "again" },
          { questionId: "q-invented", score: 10, feedback: "?" },
        ],
      },
    });

    await new GeminiAiClient().gradeFreeTextBatch([
      gradeItem,
      { ...gradeItem, questionId: "q2" },
    ]);

    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes).toMatchObject({
      "lms.ai.finish_reason": "stop",
      "gen_ai.response.model": "gemini-3.5-flash-001",
      "gen_ai.usage.input_tokens": 1200,
      "gen_ai.usage.output_tokens": 700,
      "lms.ai.usage.reasoning_tokens": 400,
      "lms.ai.usage.cached_input_tokens": 1000,
      "lms.ai.usage.total_tokens": 1900,
      "lms.ai.batch_size": 2,
      "lms.ai.items_returned": 3,
      "lms.ai.missing_ids": 1,
      "lms.ai.unknown_ids": 1,
      "lms.ai.duplicate_ids": 1,
    });
    expect(span?.attributes["error.type"]).toBeUndefined();
  });

  it("records how many questions a document read found, so an empty result is visible", async () => {
    generateTextMock.mockResolvedValue({
      finishReason: "stop",
      usage: {},
      output: { questions: [] },
    });

    const questions = await new GeminiAiClient().parseQuestionsFromText(
      "doc text",
    );

    expect(questions).toEqual([]);
    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["lms.ai.questions_returned"]).toBe(0);
    expect(span?.attributes["lms.ai.finish_reason"]).toBe("stop");
  });
});
