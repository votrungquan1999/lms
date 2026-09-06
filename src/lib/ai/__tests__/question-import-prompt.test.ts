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

  it("instructs the model to fill referenceAnswer/explanation only from the source and never invent them", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nAnswer: 4");

    // Half one: leave the fields blank/omitted when the source has nothing.
    expect(prompt).toMatch(
      /(omit|leave (it |them )?blank).{0,80}(referenceAnswer|explanation|model answer|answer key)/i,
    );

    // Half two: forbid inventing/fabricating one — a distinct rule from "omit".
    expect(prompt).toMatch(/never (invent|fabricate|make up)/i);
  });

  it("instructs the model to keep each question in the document's own language, never translating it", () => {
    const prompt = buildQuestionImportPrompt(
      "1. Qu'est-ce que la photosynthèse?",
    );

    // Distinct from "do not rephrase or summarize" — translation is its own
    // transformation and must be named explicitly, or a model could read
    // "preserve the wording" as compatible with translating the meaning.
    expect(prompt).toMatch(/(never|do not|don't) translat/i);
  });
});
