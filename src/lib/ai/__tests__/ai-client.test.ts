import { describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/google", () => ({
  google: () => "stub-model",
}));

const generateTextMock = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (cfg: unknown) => cfg },
}));

import { GeminiAiClient } from "../ai-client";

describe("GeminiAiClient.gradeFreeTextBatch", () => {
  it("forwards the model's per-item solution into each batch output row", async () => {
    generateTextMock.mockResolvedValueOnce({
      output: {
        grades: [
          {
            questionId: "q1",
            score: 75,
            feedback: "ok",
            solution: "def total(nums):\n    return sum(nums)",
          },
        ],
      },
    });

    const client = new GeminiAiClient();
    const results = await client.gradeFreeTextBatch([
      {
        questionId: "q1",
        questionContent: "Sum a list",
        studentAnswer: "def total(nums): pass",
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.solution).toBe("def total(nums):\n    return sum(nums)");
  });
});
