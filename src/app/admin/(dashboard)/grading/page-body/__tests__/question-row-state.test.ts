import type { StudentAnswer } from "src/lib/answer-service";
import { describe, expect, it } from "vitest";
import { QuestionBoxState, questionBoxState } from "../question-row-state";

const written = { type: "free_text" } as const;
const choice = { type: "single_select" } as const;
const grade = (score: number) => ({ score, gradedAt: new Date() });
const answerOf = (answered: boolean): StudentAnswer | undefined =>
  answered ? { type: "free_text", text: "My answer" } : undefined;

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
        answer: answerOf(answered),
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
        answer: answerOf(answered),
        grade: undefined,
        handedIn: false,
        isPractice: false,
      }),
    ).toBe(QuestionBoxState.Plain);
  });

  it("shows a graded written answer saved after its grade as needing a grade", () => {
    const gradedAt = new Date("2026-01-01T10:00:00Z");
    expect(
      questionBoxState({
        question: written,
        answer: answerOf(true),
        latestAnswerAt: new Date("2026-01-02T10:00:00Z"),
        grade: { score: 80, gradedAt },
        handedIn: true,
        isPractice: false,
      }),
    ).toBe(QuestionBoxState.NeedsGrade);
  });

  it("keeps a graded written answer the student changed during an open redo as graded", () => {
    expect(
      questionBoxState({
        question: written,
        answer: answerOf(true),
        latestAnswerAt: new Date("2026-01-02T10:00:00Z"),
        grade: { score: 80, gradedAt: new Date("2026-01-01T10:00:00Z") },
        handedIn: true,
        redoOpen: true,
        isPractice: false,
      }),
    ).toBe(QuestionBoxState.Graded);
  });

  it("does not show a photo answer with no photos as needing a grade", () => {
    expect(
      questionBoxState({
        question: { type: "image_answer" },
        answer: { type: "image", mediaKeys: [] },
        grade: undefined,
        handedIn: true,
        isPractice: false,
      }),
    ).not.toBe(QuestionBoxState.NeedsGrade);
  });

  it("shows a written answer that is still being written as needing a grade", () => {
    expect(
      questionBoxState({
        question: written,
        answer: answerOf(true),
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
          answer: answerOf(answered),
          grade: undefined,
          handedIn,
          isPractice: true,
        }),
      ).toBe(expected);
    },
  );
});
