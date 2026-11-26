import { questionTypeSummary } from "src/lib/question-type-words";
import { describe, expect, it } from "vitest";

describe("questionTypeSummary", () => {
  it("lists only the types the test has, in teacher words", () => {
    expect(
      questionTypeSummary(30, {
        free_text: 8,
        single_select: 16,
        multi_select: 4,
        image_answer: 2,
      }),
    ).toBe(
      "30 questions · 16 single choice · 4 multiple choice · 8 written · 2 photo",
    );
    expect(
      questionTypeSummary(1, {
        free_text: 1,
        single_select: 0,
        multi_select: 0,
        image_answer: 0,
      }),
    ).toBe("1 question · 1 written");
  });
});
