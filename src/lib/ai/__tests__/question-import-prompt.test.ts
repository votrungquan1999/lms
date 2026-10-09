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

  it("explains the highlight markers the .docx upload adds: an answer-key colour marks correct options, and markers never reach the question text", () => {
    // Marker-free document, so every match below can only come from the rules.
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // Names the exact marker syntax, so the model links it to the document text.
    expect(prompt).toMatch(/<mark color=/);
    // Only the colour used consistently on options is the key — other colours may be emphasis.
    expect(prompt).toMatch(/consistent.{0,80}colou?r.{0,120}correct/i);
    // "Preserve the wording" must not be read as "keep the tags".
    expect(prompt).toMatch(/never (copy|include|keep).{0,60}(mark|tag)/i);
  });

  it("asks for content as Markdown that keeps the document's line breaks and tables, since the LMS renders it that way", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // A real run flattened step lists and a table into one run-on paragraph.
    expect(prompt).toMatch(/content.{0,80}markdown/i);
    expect(prompt).toMatch(/keep.{0,40}line breaks/i);
    expect(prompt).toMatch(/markdown table/i);
  });

  it("asks for a blank line before and after every list and table, or the next line gets swallowed into it", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // A real run's closing question line rendered as an extra table row / part of the last bullet.
    expect(prompt).toMatch(
      /blank line (before and after|around).{0,40}(list|table)/i,
    );
  });

  it("keeps a passage with lettered sub-parts as one question — never split, repeated, or given a new lead-in", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // A real run split each essay into a/b/c/d questions, each repeating the passage under an invented lead-in.
    expect(prompt).toMatch(/sub-parts.{0,80}(one|single) question/i);
    expect(prompt).toMatch(/never split/i);
    expect(prompt).toMatch(/never (add|write|invent).{0,40}lead-in/i);
    // Keeping sub-parts together must not push true/false statements out of the tickable options.
    expect(prompt).toMatch(/true\/false statements.{0,60}options/i);
  });

  it("explains the [image N] picture tags: each question lists its pictures in imageNumbers, matched by meaning, and the tags never reach the text", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    expect(prompt).toMatch(/\[image N\]/);
    expect(prompt).toMatch(/"imageNumbers"/);
    // In the real exam a picture often sits just before its question's label, so position alone misassigns it.
    expect(prompt).toMatch(/before its question.{0,80}not by position/i);
    expect(prompt).toMatch(/never (copy|include|keep).{0,60}\[image N\]/i);
  });

  it("never turns a lone picture into a question, or leaves a field empty where a picture tag was", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // A real run's reply failed the schema after the tags were added; the exam has a stray screenshot.
    expect(prompt).toMatch(
      /never (create|make) a question (just )?for a picture/i,
    );
    expect(prompt).toMatch(/never leave .{0,80}empty/i);
  });

  it("asks for real line breaks, never the two characters backslash and n, or tables and lists collapse into one line", () => {
    const prompt = buildQuestionImportPrompt("1. What is 2+2?\nA) 3 B) 4");

    // A real reply wrote every line break as the text "\n", so tables showed raw pipes.
    expect(prompt).toMatch(/real line break/i);
    expect(prompt).toMatch(/never write the two characters backslash and "n"/i);
  });
});
