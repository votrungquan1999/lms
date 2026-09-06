import { describe, expect, it } from "vitest";
import { questionImportBatchSchema } from "../question-import-schema";

describe("questionImportBatchSchema", () => {
  it("accepts free-text and multiple-choice questions but rejects an image_answer type", () => {
    const validPayload = {
      questions: [
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
      ],
    };

    const parsed = questionImportBatchSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.questions[0].type).toBe("free_text");
    expect(parsed.data.questions[1].type).toBe("single_select");

    // image_answer cannot come from a text document — the schema must not allow it.
    const invalidPayload = {
      questions: [
        { title: "Q3", content: "A photo question.", type: "image_answer" },
      ],
    };
    expect(questionImportBatchSchema.safeParse(invalidPayload).success).toBe(
      false,
    );
  });
});
