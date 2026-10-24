import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const googleMock = vi.fn((_modelId: string) => "stub-model");
const anthropicMock = vi.fn((_modelId: string) => "claude-stub-model");
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) => anthropicMock(modelId),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (modelId: string) => googleMock(modelId),
}));

const generateTextMock = vi.fn();
// Keep the SDK's real error classes; the failure path classifies errors with them.
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateText: (...args: unknown[]) => generateTextMock(...args),
  Output: { object: (cfg: unknown) => cfg },
}));

import { ImportAiClient } from "../import-ai-client";

beforeEach(() => {
  vi.stubEnv("AI_IMPORT_PROVIDER", "gemini");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ImportAiClient provider choice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    googleMock.mockClear();
    anthropicMock.mockClear();
    generateTextMock.mockReset();
  });

  it("reads a document with Claude Sonnet 5.5, a 240 s limit and a 32K output cap when no provider is set", async () => {
    // Given no import provider setting
    vi.stubEnv("AI_IMPORT_PROVIDER", "");
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: { questions: [] },
    });

    // When a document is read
    await new ImportAiClient().parseQuestionsFromText("1. What is 2+2?");

    // Then Claude Sonnet 5.5 is called, and Gemini is not
    expect(anthropicMock).toHaveBeenCalledWith("claude-sonnet-5-5");
    expect(googleMock).not.toHaveBeenCalled();
    const [options] = generateTextMock.mock.calls[0];
    expect(options).toMatchObject({
      timeout: 240_000,
      maxOutputTokens: 32_000,
    });
    expect(options.providerOptions).toBeUndefined();
  });
});

describe("ImportAiClient provider setting", () => {
  afterEach(() => {
    googleMock.mockClear();
    anthropicMock.mockClear();
    generateTextMock.mockReset();
  });

  it("calls the Claude model named in CLAUDE_MODEL_ID", async () => {
    // Given an override of the Claude model
    vi.stubEnv("AI_IMPORT_PROVIDER", "");
    vi.stubEnv("CLAUDE_MODEL_ID", "claude-haiku-4-5");
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: { questions: [] },
    });

    // When a document is read
    await new ImportAiClient().parseQuestionsFromText("1. What is 2+2?");

    // Then that model is called
    expect(anthropicMock).toHaveBeenCalledWith("claude-haiku-4-5");
  });

  it("names the setting in the failure when its value is not a known provider, and calls no model", async () => {
    // Given a misspelled provider setting
    vi.stubEnv("AI_IMPORT_PROVIDER", "claud");

    // When a document is read
    const read = new ImportAiClient().parseQuestionsFromText("1. What is 2+2?");

    // Then the failure says which setting is wrong
    await expect(read).rejects.toThrow("AI_IMPORT_PROVIDER");
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});

describe("ImportAiClient model choice", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls the model named in GEMINI_MODEL_ID, so a run can move off an overloaded default", async () => {
    vi.stubEnv("GEMINI_MODEL_ID", "gemini-2.5-flash");
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: { questions: [] },
    });

    await new ImportAiClient().parseQuestionsFromText("1. What is 2+2?");

    expect(googleMock).toHaveBeenCalledWith("gemini-2.5-flash");
  });
});

describe("ImportAiClient.parseQuestionsFromText", () => {
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

    const [question] = await new ImportAiClient().parseQuestionsFromText(
      "Câu 4 …",
    );

    expect(question?.content).toBe(
      "Các bước:\n- Lấy mẫu\n- Cấy mẫu\n\nQuy trình trên thuộc phương pháp",
    );
  });
});

describe("ImportAiClient.parseQuestionsFromText pictures", () => {
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

    const [question] = await new ImportAiClient().parseQuestionsFromText(
      "[image 10]Câu 14: Quan sát hình bên",
    );

    expect(question?.imageNumbers).toEqual([10]);
  });
});

describe("ImportAiClient.retryQuestion", () => {
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

    const question = await new ImportAiClient().retryQuestion(
      "Câu 4 …",
      { title: "Câu 4", content: "Các bước: …", type: "free_text" },
      "Keep each step on its own line",
    );

    expect(question.content).toBe(
      "Các bước:\n- Lấy mẫu\n- Cấy mẫu\n\nQuy trình trên thuộc phương pháp",
    );
  });
});

describe("ImportAiClient.retryQuestion pictures", () => {
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

    const question = await new ImportAiClient().retryQuestion(
      "[image 10]Câu 14: Quan sát hình bên",
      { title: "Câu 14", content: "Quan sát hình bên", type: "free_text" },
      "The picture is missing",
    );

    expect(question.imageNumbers).toEqual([10]);
  });
});
