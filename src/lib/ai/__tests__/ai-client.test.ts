import { afterEach, describe, expect, it, vi } from "vitest";

const googleMock = vi.fn((_modelId: string) => "stub-model");
vi.mock("@ai-sdk/google", () => ({
  google: (modelId: string) => googleMock(modelId),
}));

const generateTextMock = vi.fn();
vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (cfg: unknown) => cfg },
}));

import { GeminiAiClient } from "../ai-client";

describe("GeminiAiClient model choice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls the model named in GEMINI_MODEL_ID, so a run can move off an overloaded default", async () => {
    vi.stubEnv("GEMINI_MODEL_ID", "gemini-2.5-flash");
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: { questions: [] },
    });

    await new GeminiAiClient().parseQuestionsFromText("1. What is 2+2?");

    expect(googleMock).toHaveBeenCalledWith("gemini-2.5-flash");
  });
});

describe("GeminiAiClient.parseQuestionsFromText", () => {
  it("closes a list the model left open, so the question's last line doesn't render inside its final bullet", async () => {
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        questions: [
          {
            title: "Câu 4",
            content:
              "Các bước:\n- Lấy mẫu\n- Cấy mẫu\nQuy trình trên thuộc phương pháp",
            type: "free_text",
          },
        ],
      },
    });

    const [question] = await new GeminiAiClient().parseQuestionsFromText(
      "Câu 4 …",
    );

    expect(question?.content).toBe(
      "Các bước:\n- Lấy mẫu\n- Cấy mẫu\n\nQuy trình trên thuộc phương pháp",
    );
  });
});

describe("GeminiAiClient.parseQuestionsFromText pictures", () => {
  it("keeps the picture numbers the model assigned to each question", async () => {
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        questions: [
          {
            title: "Câu 14",
            content: "Quan sát hình bên",
            type: "free_text",
            imageNumbers: [10],
          },
        ],
      },
    });

    const [question] = await new GeminiAiClient().parseQuestionsFromText(
      "[image 10]Câu 14: Quan sát hình bên",
    );

    expect(question?.imageNumbers).toEqual([10]);
  });
});

describe("GeminiAiClient.retryQuestion", () => {
  it("closes a list the model left open in the re-read question too", async () => {
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        question: {
          title: "Câu 4",
          content:
            "Các bước:\n- Lấy mẫu\n- Cấy mẫu\nQuy trình trên thuộc phương pháp",
          type: "free_text",
        },
      },
    });

    const question = await new GeminiAiClient().retryQuestion(
      "Câu 4 …",
      { title: "Câu 4", content: "Các bước: …", type: "free_text" },
      "Keep each step on its own line",
    );

    expect(question.content).toBe(
      "Các bước:\n- Lấy mẫu\n- Cấy mẫu\n\nQuy trình trên thuộc phương pháp",
    );
  });
});

describe("GeminiAiClient.retryQuestion pictures", () => {
  it("keeps the picture numbers the model assigned to the re-read question", async () => {
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        question: {
          title: "Câu 14",
          content: "Quan sát hình bên",
          type: "free_text",
          imageNumbers: [10],
        },
      },
    });

    const question = await new GeminiAiClient().retryQuestion(
      "[image 10]Câu 14: Quan sát hình bên",
      { title: "Câu 14", content: "Quan sát hình bên", type: "free_text" },
      "The picture is missing",
    );

    expect(question.imageNumbers).toEqual([10]);
  });
});

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
