import { describe, expect, it } from "vitest";
import { buildGradingPrompt } from "../grading-prompt";

describe("buildGradingPrompt", () => {
  it("instructs the model to omit the solution for a fully-correct (100) answer while keeping minimal-diff guidance for the rest", () => {
    const prompt = buildGradingPrompt([
      {
        questionId: "q1",
        questionContent: "Sum a list using a loop.",
        studentAnswer: "def total(nums): pass",
      },
    ]);

    // The new instruction: omit the solution entirely for a perfect score.
    expect(prompt).toMatch(/omit the .?solution.? field/i);
    expect(prompt).toMatch(/100/);

    // Existing guidance still present: solution + minimal-diff for the rest.
    expect(prompt).toMatch(/solution/i);
    expect(prompt).toMatch(/minimal|smallest|preserve/i);

    // The other JSON-shape fields are still advertised.
    expect(prompt).toMatch(/"questionId":\s*string/);
    expect(prompt).toMatch(/"score":\s*int 0-100/);
    expect(prompt).toMatch(/"feedback":\s*string/);
  });
});
