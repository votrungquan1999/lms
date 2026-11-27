import { describe, expect, it } from "vitest";
import { QuestionBoxState, questionBoxState } from "../question-row-state";

const written = { type: "free_text" } as const;
const choice = { type: "single_select" } as const;
const grade = (score: number) => ({ score, gradedAt: new Date() });

describe("Feature: the state a question's box shows", () => {
  it.each([
    [
      "a written answer with no grade",
      written,
      true,
      undefined,
      QuestionBoxState.NeedsGrade,
    ],
    [
      "a written answer with a grade",
      written,
      true,
      grade(80),
      QuestionBoxState.Graded,
    ],
    [
      "a full-marks choice answer",
      choice,
      true,
      grade(100),
      QuestionBoxState.Correct,
    ],
    [
      "a half-marks choice answer",
      choice,
      true,
      grade(50),
      QuestionBoxState.PartlyRight,
    ],
    [
      "a zero-marks choice answer",
      choice,
      true,
      grade(0),
      QuestionBoxState.Wrong,
    ],
    [
      "no answer after hand-in",
      written,
      false,
      undefined,
      QuestionBoxState.Blank,
    ],
    [
      "a grade left on a blank answer",
      written,
      false,
      grade(0),
      QuestionBoxState.Graded,
    ],
  ])("%s", (_name, question, answered, saved, expected) => {
    expect(
      questionBoxState({
        question,
        answered,
        grade: saved,
        handedIn: true,
        isPractice: false,
      }),
    ).toBe(expected);
  });

  it.each([
    ["an unanswered question", written, false],
    ["a choice answer", choice, true],
  ])("shows %s as plain before hand-in", (_name, question, answered) => {
    expect(
      questionBoxState({
        question,
        answered,
        grade: undefined,
        handedIn: false,
        isPractice: false,
      }),
    ).toBe(QuestionBoxState.Plain);
  });

  it("shows a written answer that is still being written as needing a grade", () => {
    expect(
      questionBoxState({
        question: written,
        answered: true,
        grade: undefined,
        handedIn: false,
        isPractice: false,
      }),
    ).toBe(QuestionBoxState.NeedsGrade);
  });

  it.each([
    [true, true, QuestionBoxState.Answered],
    [false, true, QuestionBoxState.Blank],
    [false, false, QuestionBoxState.Plain],
  ])(
    "on a practice test shows answered=%s handedIn=%s as %s",
    (answered, handedIn, expected) => {
      expect(
        questionBoxState({
          question: written,
          answered,
          grade: undefined,
          handedIn,
          isPractice: true,
        }),
      ).toBe(expected);
    },
  );
});
