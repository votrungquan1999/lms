import { describe, expect, it } from "vitest";
import { buildGradingPrompt } from "../grading-prompt";

describe("buildGradingPrompt", () => {
  it("instructs the model to produce a minimal-diff solution and advertises solution in the JSON shape", () => {
    const prompt = buildGradingPrompt([
      {
        questionId: "q1",
        questionContent: "Sum a list using a loop.",
        studentAnswer: "def total(nums): pass",
      },
    ]);

    expect(prompt).toMatch(/solution/i);
    expect(prompt).toMatch(/minimal|smallest|preserve/i);
    expect(prompt).toMatch(/"solution":\s*string/);
    expect(prompt).toMatch(/"questionId":\s*string/);
    expect(prompt).toMatch(/"score":\s*int 0-100/);
    expect(prompt).toMatch(/"feedback":\s*string/);
  });
});
