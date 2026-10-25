import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
} from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const parseQuestionsFromText = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getQuestionParseClient: vi.fn(async () => ({ parseQuestionsFromText })),
}));

import {
  RefusalError,
  UnfinishedReplyError,
} from "src/lib/ai/ai-call-telemetry";
import { ImportProviderSettingError } from "src/lib/ai/import-ai-client";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import { parseQuestionsAction } from "../actions";

describe("Feature: parseQuestionsAction turns extracted document text into a reviewable question list", () => {
  beforeEach(() => {
    parseQuestionsFromText.mockReset();
    requireAdminSession
      .mockReset()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the questions the parse client extracted, identified by type", async () => {
    parseQuestionsFromText.mockResolvedValueOnce([
      { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      {
        title: "Q2",
        content: "Pick the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: true },
        ],
      },
    ]);

    const state = await parseQuestionsAction("1. Explain... 2. Pick...");

    expect(state.success).toBe(true);
    expect(state.questions).toEqual([
      { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      {
        title: "Q2",
        content: "Pick the prime number.",
        type: "single_select",
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: true },
        ],
      },
    ]);
  });

  it("hands the parse client the picture numbers the browser sent", async () => {
    parseQuestionsFromText.mockResolvedValueOnce([]);

    await parseQuestionsAction("1. Look at [image 2]", [2, 5]);

    expect(parseQuestionsFromText).toHaveBeenCalledWith(
      "1. Look at [image 2]",
      [2, 5],
    );
  });

  it("refuses picture numbers that are not positive whole numbers, without calling the parse client", async () => {
    const state = await parseQuestionsAction("some document text", [1, -2]);

    expect(state.success).toBe(false);
    expect(parseQuestionsFromText).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller and never calls the parse client", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("no session"));

    const state = await parseQuestionsAction("some document text");

    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized: admin access required");
    expect(parseQuestionsFromText).not.toHaveBeenCalled();
  });

  describe("when the AI read fails, the message tells the teacher why and whether trying again can help", () => {
    function apiError(statusCode: number, isRetryable = false): APICallError {
      return new APICallError({
        message: `provider said ${statusCode}`,
        url: "https://provider.example/v1",
        requestBodyValues: {},
        statusCode,
        isRetryable,
      });
    }

    async function failWith(error: unknown): Promise<string> {
      parseQuestionsFromText.mockRejectedValueOnce(error);
      const state = await parseQuestionsAction("some document text");
      expect(state.success).toBe(false);
      return state.message;
    }

    it("says to try again in a few minutes when the AI is overloaded", async () => {
      const message = await failWith(apiError(503, true));

      expect(message).toMatch(/few minutes/i);
    });

    it("says to split the document when the AI ran out of time", async () => {
      const message = await failWith(
        new DOMException("signal timed out", "TimeoutError"),
      );

      expect(message).toMatch(/too long/i);
      expect(message).toMatch(/split/i);
    });

    it("says the document took too long when the AI call was aborted", async () => {
      const message = await failWith(new DOMException("aborted", "AbortError"));

      expect(message).toMatch(/too long/i);
    });

    it("says to split the document when the AI hit its output limit", async () => {
      const message = await failWith(
        new UnfinishedReplyError([{ finishReason: "length" }]),
      );

      expect(message).toMatch(/more than the AI can write/i);
      expect(message).toMatch(/split/i);
    });

    it("says retrying will not help when the AI refused the document", async () => {
      const message = await failWith(
        new RefusalError("cyber", [{ finishReason: "content-filter" }]),
      );

      expect(message).toMatch(/will not help/i);
    });

    it("says retrying will not help when the AI's safety filter blocked the reply", async () => {
      const message = await failWith(
        new UnfinishedReplyError([{ finishReason: "content-filter" }]),
      );

      expect(message).toMatch(/will not help/i);
    });

    it("says one more try may help when the AI answered in the wrong shape", async () => {
      const message = await failWith(
        new NoObjectGeneratedError({
          message: "No object generated",
          finishReason: "stop",
          response: { id: "r1", timestamp: new Date(0), modelId: "model" },
          // The error only reads usage for telemetry, which this test does not touch.
          usage: {} as never,
        }),
      );

      expect(message).toMatch(/trying once more may help/i);
    });

    it.each([401, 403, 404])(
      "tells the teacher to ask the site owner when the provider answers %i",
      async (status) => {
        const message = await failWith(apiError(status));

        expect(message).toMatch(/site owner/i);
      },
    );

    it("tells the teacher to ask the site owner when the API key is missing", async () => {
      const message = await failWith(
        new LoadAPIKeyError({ message: "API key is missing" }),
      );

      expect(message).toMatch(/site owner/i);
    });

    it("tells the teacher to ask the site owner when the provider setting is invalid", async () => {
      const message = await failWith(
        new ImportProviderSettingError("AI_IMPORT_PROVIDER must be one of x"),
      );

      expect(message).toMatch(/site owner/i);
    });

    it("says to try again and contact the developer for an unexpected error", async () => {
      const message = await failWith(new Error("something odd"));

      expect(message).toMatch(/contact the developer/i);
    });

    it.each([
      { name: "a busy provider", error: apiError(503, true) },
      {
        name: "an unknown error",
        error: new Error("Gemini quota exceeded for project x"),
      },
    ])(
      "never echoes the provider's own error text for $name",
      async ({ error }) => {
        const message = await failWith(error);

        expect(message).not.toMatch(/gemini|quota|project x/i);
        expect(message).not.toMatch(/provider said|claude|anthropic|google/i);
      },
    );

    function gaveUp(lastError: APICallError): RetryError {
      return new RetryError({
        message: "Failed after 3 attempts",
        reason: "maxRetriesExceeded",
        errors: [lastError, lastError, lastError],
      });
    }

    it.each([
      { name: "a rate limit", error: apiError(429, true) },
      { name: "an overloaded provider (529)", error: apiError(529, true) },
      {
        name: "a dropped connection",
        error: new APICallError({
          message: "fetch failed",
          url: "https://provider.example",
          requestBodyValues: {},
          isRetryable: true,
        }),
      },
      {
        name: "a rate limit after the SDK gave up",
        error: gaveUp(apiError(429, true)),
      },
    ])("says to try again in a few minutes for $name", async ({ error }) => {
      const message = await failWith(error);

      expect(message).toMatch(/few minutes/i);
    });

    it("tells the teacher to ask the site owner when the SDK gave up on a rejected key", async () => {
      const message = await failWith(gaveUp(apiError(403)));

      expect(message).toMatch(/site owner/i);
    });

    it.each([
      { name: "a bad request", error: apiError(400) },
      {
        name: "an AI reply that produced no output",
        error: new NoOutputGeneratedError(),
      },
      {
        name: "a reply that stopped for another reason",
        error: new UnfinishedReplyError([{ finishReason: "other" }]),
      },
      { name: "a thrown string", error: "boom" },
    ])(
      "says to try again and contact the developer for $name",
      async ({ error }) => {
        const message = await failWith(error);

        expect(message).toMatch(/contact the developer/i);
      },
    );
  });

  it("reads the extracted count with correct grammar, not the literal '(s)'", async () => {
    parseQuestionsFromText.mockResolvedValueOnce([
      { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
    ]);

    const state = await parseQuestionsAction("some document text");

    expect(state.message).toBe("Extracted 1 question");
    expect(state.message).not.toContain("question(s)");
  });
});
