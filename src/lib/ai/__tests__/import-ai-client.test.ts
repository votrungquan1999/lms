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

describe("ImportAiClient refusal time budget", () => {
  const refused = {
    finishReason: "content-filter",
    providerMetadata: { anthropic: { stopDetails: { category: "bio" } } },
    usage: {},
  };

  afterEach(() => {
    vi.useRealTimers();
    generateTextMock.mockReset();
  });

  it.each([
    [100_000, 140_000],
    [235_000, undefined],
  ])(
    "after a refusal that took %i ms, re-reads with the %s ms left of the 240 s budget (none when too little is left)",
    async (elapsedMs, expectedTimeout) => {
      // Given the first request refuses after taking elapsedMs
      vi.stubEnv("AI_IMPORT_PROVIDER", "");
      vi.useFakeTimers({ toFake: ["Date"] });
      generateTextMock.mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() + elapsedMs);
        return refused;
      });
      generateTextMock.mockResolvedValueOnce({
        finishReason: "stop",
        usage: {},
        output: { questions: [] },
      });

      // When a document is read
      const read = new ImportAiClient().parseQuestionsFromText("1. An exam");

      // Then the re-read gets only the remaining time, or the read fails with no re-read
      if (expectedTimeout === undefined) {
        await expect(read).rejects.toThrow("AI refused to answer");
        expect(generateTextMock).toHaveBeenCalledTimes(1);
      } else {
        await read;
        expect(generateTextMock.mock.calls[1][0]).toMatchObject({
          timeout: expectedTimeout,
        });
      }
    },
  );
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
  it("attaches the pictures marked inside a question's text and takes the markers out of it", async () => {
    // Given a reply with no picture list, whose texts keep the document's markers
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        questions: [
          {
            title: "Câu 14",
            content: "[image 2]Quan sát hình bên",
            type: "single_select",
            options: [
              { text: "Tế bào", isCorrect: true },
              { text: "[image 3]Mô", isCorrect: false },
            ],
          },
        ],
      },
    });

    // When the document that holds both pictures is read
    const [question] = await new ImportAiClient().parseQuestionsFromText(
      "[image 2]Câu 14: Quan sát hình bên\nA. Tế bào\nB. [image 3]Mô",
      [2, 3],
    );

    // Then both pictures are attached and no marker is left in the texts
    expect(question?.imageNumbers).toEqual([2, 3]);
    expect(question?.content).toBe("Quan sát hình bên");
    expect(question?.options?.map((option) => option.text)).toEqual([
      "Tế bào",
      "Mô",
    ]);
  });
});

describe("ImportAiClient.parseQuestionsFromText answer-key pictures", () => {
  it("never attaches a picture placed in a model answer or explanation, and takes its marker out of that text", async () => {
    // Given a reply whose model answer and explanation carry markers
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        questions: [
          {
            title: "Câu 5",
            content: "[image 1]Giải thích sự quang hợp",
            type: "free_text",
            referenceAnswer: "Ánh sáng tạo ra đường [image 4]",
            explanation: "[image 5]Vì lá có diệp lục",
          },
        ],
      },
    });

    // When the document that holds all three pictures is read
    const [question] = await new ImportAiClient().parseQuestionsFromText(
      "[image 1]Câu 5: Giải thích sự quang hợp\nĐáp án: Ánh sáng tạo ra đường [image 4]\nGiải thích: [image 5]Vì lá có diệp lục",
      [1, 4, 5],
    );

    // Then only the picture in the question's own text is attached
    expect(question?.imageNumbers).toEqual([1]);
    expect(question?.referenceAnswer).toBe("Ánh sáng tạo ra đường");
    expect(question?.explanation).toBe("Vì lá có diệp lục");
  });
});

describe("ImportAiClient.parseQuestionsFromText answer-key markers only", () => {
  it("leaves out a model answer that was only a picture marker, so the import is not stopped on it", async () => {
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        questions: [
          {
            title: "Câu 5",
            content: "Giải thích",
            type: "free_text",
            referenceAnswer: "[image 4]",
          },
        ],
      },
    });

    const [question] = await new ImportAiClient().parseQuestionsFromText(
      "Câu 5: Giải thích\nĐáp án: [image 4]",
    );

    expect(question?.referenceAnswer).toBeUndefined();
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
  it("replaces the question's pictures with the ones the re-read marks in its text, and takes the markers out", async () => {
    // Given a re-read reply with no picture list, marking picture 3 and not picture 10
    generateTextMock.mockResolvedValueOnce({
      usage: {},
      output: {
        question: {
          title: "Câu 14",
          content: "[image 3]Quan sát hình bên",
          type: "free_text",
        },
      },
    });

    // When a draft that held picture 10 is re-read
    const question = await new ImportAiClient().retryQuestion(
      "[image 10]Câu 14: [image 3]Quan sát hình bên",
      {
        title: "Câu 14",
        content: "Quan sát hình bên",
        type: "free_text",
        imageNumbers: [10],
      },
      "The picture is missing",
    );

    // Then only the marked picture remains, and the tag is gone
    expect(question.imageNumbers).toEqual([3]);
    expect(question.content).toBe("Quan sát hình bên");
  });
});
