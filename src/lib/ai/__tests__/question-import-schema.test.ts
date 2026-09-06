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

  it("accepts a question missing referenceAnswer/explanation but rejects them when present-but-empty", () => {
    // A source document with no model answer or explanation: both fields are absent.
    const absentPayload = {
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      ],
    };
    expect(questionImportBatchSchema.safeParse(absentPayload).success).toBe(
      true,
    );

    // The model emitting "" instead of omitting the key must be rejected —
    // a blank-but-present field would be indistinguishable from "found nothing".
    const emptyReferenceAnswerPayload = {
      questions: [
        {
          title: "Q1",
          content: "Explain photosynthesis.",
          type: "free_text",
          referenceAnswer: "",
        },
      ],
    };
    const referenceAnswerResult = questionImportBatchSchema.safeParse(
      emptyReferenceAnswerPayload,
    );
    expect(referenceAnswerResult.success).toBe(false);
    if (!referenceAnswerResult.success) {
      const issue = referenceAnswerResult.error.issues.find((i) =>
        i.path.includes("referenceAnswer"),
      );
      expect(issue?.code).toBe("too_small");
    }

    const emptyExplanationPayload = {
      questions: [
        {
          title: "Q1",
          content: "Explain photosynthesis.",
          type: "free_text",
          explanation: "",
        },
      ],
    };
    const explanationResult = questionImportBatchSchema.safeParse(
      emptyExplanationPayload,
    );
    expect(explanationResult.success).toBe(false);
    if (!explanationResult.success) {
      const issue = explanationResult.error.issues.find((i) =>
        i.path.includes("explanation"),
      );
      expect(issue?.code).toBe("too_small");
    }
  });
});
