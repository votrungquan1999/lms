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
      // `usage` is always present on the real SDK result (token fields may be
      // undefined); the span enrichment reads `result.usage.*`, so the mock
      // must include it. This test does not assert on token counts.
      usage: {},
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

  it("produces a suggestion (score + feedback, no solution) instead of erroring when the model omits the solution for a perfect score", async () => {
    // Given: the model returns a perfect-score item with NO solution field,
    // run through the SAME schema the live SDK applies to model output (the
    // SDK throws AI_NoObjectGeneratedError on a schema miss — we mirror that
    // by parsing the raw output via the configured schema before returning).
    generateTextMock.mockImplementationOnce(
      (opts: {
        output: { schema: { parse: (value: unknown) => unknown } };
      }) => {
        const rawModelOutput = {
          grades: [{ questionId: "q1", score: 100, feedback: "perfect" }],
        };
        return Promise.resolve({
          usage: {},
          output: opts.output.schema.parse(rawModelOutput),
        });
      },
    );

    const client = new GeminiAiClient();

    // When: grading a batch whose answer is fully correct.
    const results = await client.gradeFreeTextBatch([
      {
        questionId: "q1",
        questionContent: "Sum a list",
        studentAnswer: "def total(nums):\n    return sum(nums)",
      },
    ]);

    // Then: one output row carrying score + feedback and NO solution, no throw.
    expect(results).toHaveLength(1);
    expect(results[0]?.score).toBe(100);
    expect(results[0]?.feedback).toBe("perfect");
    expect(results[0]?.solution).toBeUndefined();
  });
});
