import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const retryQuestion = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getQuestionParseClient: vi.fn(async () => ({ retryQuestion })),
}));

import { retryQuestionAction } from "../actions";

const currentQuestion = {
  title: "Q1",
  content: "Explain photosynthesis.",
  type: "free_text" as const,
};

describe("Feature: retryQuestionAction re-reads one question, addressing a teacher's correction note", () => {
  beforeEach(() => {
    retryQuestion.mockReset();
    requireAdminSession.mockReset().mockResolvedValue({ userId: "admin-1" });
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

  it("returns a friendly message and never throws when the AI call fails", async () => {
    retryQuestion.mockRejectedValueOnce(new Error("Gemini timed out"));

    const state = await retryQuestionAction(
      "1. Explain photosynthesis.",
      currentQuestion,
      "This should focus on the light-dependent reactions.",
    );

    expect(state.success).toBe(false);
    expect(state.message).toBe("AI retry failed. Please try again.");
  });
});
