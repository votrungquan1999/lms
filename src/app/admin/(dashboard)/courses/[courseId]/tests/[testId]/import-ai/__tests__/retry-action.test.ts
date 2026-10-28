import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi
  .fn()
  .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const retryQuestion = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getQuestionParseClient: vi.fn(async () => ({ retryQuestion })),
}));

import { APICallError } from "ai";
import { RefusalError } from "src/lib/ai/ai-call-telemetry";
import { TEST_SCHOOL } from "src/tests/create-test-db";
import { retryQuestionAction } from "../actions";

const currentQuestion = {
  title: "Q1",
  content: "Explain photosynthesis.",
  type: "free_text" as const,
};

describe("Feature: retryQuestionAction re-reads one question, addressing a teacher's correction note", () => {
  beforeEach(() => {
    retryQuestion.mockReset();
    requireAdminSession
      .mockReset()
      .mockResolvedValue({ userId: "admin-1", school: TEST_SCHOOL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the corrected question the parse client produced", async () => {
    retryQuestion.mockResolvedValueOnce({
      title: "Q1 - explain the light-dependent reactions",
      content: "Explain photosynthesis, focusing on the light reactions.",
      type: "free_text",
    });

    const state = await retryQuestionAction(
      "1. Explain photosynthesis.",
      currentQuestion,
      "This should focus on the light-dependent reactions.",
    );

    expect(state.success).toBe(true);
    expect(state.question).toEqual({
      title: "Q1 - explain the light-dependent reactions",
      content: "Explain photosynthesis, focusing on the light reactions.",
      type: "free_text",
    });
  });

  it("hands the draft's current pictures to the parse client intact", async () => {
    retryQuestion.mockResolvedValueOnce({ ...currentQuestion });

    await retryQuestionAction(
      "[image 1]1. Explain photosynthesis.",
      { ...currentQuestion, imageNumbers: [1] },
      "Keep the picture.",
    );

    expect(retryQuestion).toHaveBeenCalledWith(
      "[image 1]1. Explain photosynthesis.",
      expect.objectContaining({ imageNumbers: [1] }),
      "Keep the picture.",
    );
  });

  it.each([[0], [-1], [1.5]])(
    "rejects a draft holding picture number %s, and never calls the parse client",
    async (number) => {
      const state = await retryQuestionAction(
        "1. Explain photosynthesis.",
        { ...currentQuestion, imageNumbers: [number] },
        "Fix it.",
      );

      expect(state.success).toBe(false);
      expect(retryQuestion).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["title", { ...currentQuestion, title: "" }, "Question: title is empty"],
    [
      "content",
      { ...currentQuestion, content: "" },
      "Question: content is empty",
    ],
    [
      "an option",
      {
        ...currentQuestion,
        type: "single_select" as const,
        options: [
          { text: "Light", isCorrect: true },
          { text: "", isCorrect: false },
        ],
      },
      "Question: option 2 is empty",
    ],
  ])(
    "names the field when the draft's %s is empty, and never calls the parse client",
    async (_field, draft, message) => {
      const state = await retryQuestionAction(
        "1. Explain photosynthesis.",
        draft,
        "Fix it.",
      );

      expect(state).toEqual({ success: false, message });
      expect(retryQuestion).not.toHaveBeenCalled();
    },
  );

  it("refuses an unauthenticated caller and never calls the parse client", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("no session"));

    const state = await retryQuestionAction(
      "1. Explain photosynthesis.",
      currentQuestion,
      "This should focus on the light-dependent reactions.",
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized: admin access required");
    expect(retryQuestion).not.toHaveBeenCalled();
  });

  describe("when the AI retry fails, the message tells the teacher why and whether trying again can help", () => {
    async function failWith(error: unknown): Promise<string> {
      retryQuestion.mockRejectedValueOnce(error);
      const state = await retryQuestionAction(
        "1. Explain photosynthesis.",
        currentQuestion,
        "This should focus on the light-dependent reactions.",
      );
      expect(state.success).toBe(false);
      return state.message;
    }

    it("says to try again in a few minutes when the AI is overloaded", async () => {
      const message = await failWith(
        new APICallError({
          message: "provider said 503",
          url: "https://provider.example/v1",
          requestBodyValues: {},
          statusCode: 503,
          isRetryable: true,
        }),
      );

      expect(message).toMatch(/few minutes/i);
    });

    it("says retrying will not help when the AI refused the question", async () => {
      const message = await failWith(
        new RefusalError("cyber", [{ finishReason: "content-filter" }]),
      );

      expect(message).toMatch(/will not help/i);
    });

    it("says to try again and contact the developer for an unexpected error", async () => {
      const message = await failWith(new Error("something odd"));

      expect(message).toMatch(/contact the developer/i);
    });
  });
});
