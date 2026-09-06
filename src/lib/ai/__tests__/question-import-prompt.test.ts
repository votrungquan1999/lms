import { describe, expect, it } from "vitest";
import { buildQuestionImportPrompt } from "../question-import-prompt";

describe("buildQuestionImportPrompt", () => {
  it("instructs the model to classify each question by type and extract options for multiple-choice questions", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // The model must pick one of these three exact type values.
    expect(prompt).toMatch(/free_text/);
    expect(prompt).toMatch(/single_select/);
    expect(prompt).toMatch(/multi_select/);

    // Multiple-choice questions need their options (and correct answer) extracted.
    expect(prompt).toMatch(/option/i);

    // The source document text is carried into the prompt.
    expect(prompt).toMatch(/2\+2/);
  });
});
