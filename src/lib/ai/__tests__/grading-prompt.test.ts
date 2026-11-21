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

  it("on regenerate, makes the teacher's note override the smallest-edit rule and marks the prior solution as rejected", () => {
    const reason = "Students check sqrt with: while i * i < x: i += 1";
    const priorSolution = "for j in range(2, int(i**0.5) + 1):";

    const prompt = buildGradingPrompt(
      [
        {
          questionId: "q1",
          questionContent: "Count primes in each range.",
          studentAnswer: "for j in range(2, i):",
        },
      ],
      {
        reason,
        priorGrades: [
          {
            questionId: "q1",
            score: 80,
            feedback: "Too slow.",
            solution: priorSolution,
          },
        ],
      },
    );

    // The note is stated as an overriding rule, ahead of the smallest-edit rule.
    const noteAt = prompt.indexOf(reason);
    const smallestEditAt = prompt.indexOf("SMALLEST possible edit");
    expect(noteAt).toBeGreaterThan(-1);
    expect(noteAt).toBeLessThan(smallestEditAt);
    expect(prompt).toMatch(/overrides every other rule/i);
    expect(prompt).toMatch(/solution MUST use that (technique|approach)/i);

    // The prior solution is labelled rejected so the model does not reuse it.
    expect(prompt).toContain(
      `Rejected prior solution (do not repeat it; rewrite it to follow the teacher's note):\n${priorSolution}`,
    );
  });
});
