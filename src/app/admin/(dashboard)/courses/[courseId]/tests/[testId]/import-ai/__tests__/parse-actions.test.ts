import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn().mockResolvedValue({ userId: "admin-1" });
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

const parseQuestionsFromText = vi.fn();
vi.mock("src/lib/services-singleton", () => ({
  getQuestionParseClient: vi.fn(async () => ({ parseQuestionsFromText })),
}));

import { parseQuestionsAction } from "../actions";

describe("Feature: parseQuestionsAction turns extracted document text into a reviewable question list", () => {
  beforeEach(() => {
    parseQuestionsFromText.mockReset();
    requireAdminSession.mockReset().mockResolvedValue({ userId: "admin-1" });
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

  it("refuses an unauthenticated caller and never calls the parse client", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("no session"));

    const state = await parseQuestionsAction("some document text");

    expect(state.success).toBe(false);
    expect(state.message).toBe("Unauthorized: admin access required");
    expect(parseQuestionsFromText).not.toHaveBeenCalled();
  });

  it("returns a friendly message and never throws when the AI call fails", async () => {
    parseQuestionsFromText.mockRejectedValueOnce(new Error("Gemini timed out"));

    const state = await parseQuestionsAction("some document text");

    expect(state.success).toBe(false);
    expect(state.message).toBe(
      "AI question extraction failed. Please try again.",
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
