import { suggestionReadsUsed } from "src/lib/teacher-own-grade";
import { describe, expect, it } from "vitest";

const applied = new Date("2026-01-01T00:00:00Z");

describe("suggestionReadsUsed", () => {
  it("drops Used when the teacher adds a solution to a grade that used a suggestion with no fix", () => {
    const suggestion = {
      score: 70,
      feedback: "fb",
      solution: undefined,
      appliedAt: applied,
    };

    expect(
      suggestionReadsUsed(suggestion, {
        score: 70,
        feedback: "fb",
        solution: undefined,
      }),
    ).toBe(true);
    expect(
      suggestionReadsUsed(suggestion, {
        score: 70,
        feedback: "fb",
        solution: "her own solution",
      }),
    ).toBe(false);
  });

  it("reads Used when a suggestion with a fix matches the saved solution, and not when it differs", () => {
    const suggestion = {
      score: 70,
      feedback: "fb",
      solution: "the fix",
      appliedAt: applied,
    };

    expect(
      suggestionReadsUsed(suggestion, {
        score: 70,
        feedback: "fb",
        solution: "the fix",
      }),
    ).toBe(true);
    expect(
      suggestionReadsUsed(suggestion, {
        score: 70,
        feedback: "fb",
        solution: "edited",
      }),
    ).toBe(false);
  });
});
