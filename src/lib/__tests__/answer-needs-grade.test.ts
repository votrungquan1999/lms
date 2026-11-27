import { answerNeedsGrade } from "src/lib/next-answer-to-grade";
import { describe, expect, it } from "vitest";

const saved = new Date("2026-01-01T10:00:00Z");
const later = new Date("2026-01-01T11:00:00Z");
const graded = { gradedAt: saved, gradedAnswerAt: saved };

describe("Feature: one rule says whether an answer waits for the teacher's grade", () => {
  it("waits when a written answer has no grade", () => {
    expect(
      answerNeedsGrade({
        question: { type: "free_text" },
        answer: { type: "free_text", text: "x" },
        answeredAt: saved,
        grade: null,
        redoOpen: false,
      }),
    ).toBe(true);
  });

  it("waits again when the answer was saved after the one its grade describes", () => {
    expect(
      answerNeedsGrade({
        question: { type: "free_text" },
        answer: { type: "free_text", text: "x" },
        answeredAt: later,
        grade: graded,
        redoOpen: false,
      }),
    ).toBe(true);
  });

  it("does not wait for a written answer of spaces only", () => {
    expect(
      answerNeedsGrade({
        question: { type: "free_text" },
        answer: { type: "free_text", text: "   " },
        answeredAt: saved,
        grade: null,
        redoOpen: false,
      }),
    ).toBe(false);
  });

  it("does not wait for a choice answer, which the system grades", () => {
    expect(
      answerNeedsGrade({
        question: { type: "single_select" },
        answer: { type: "mc", selectedIds: ["a"] },
        answeredAt: saved,
        grade: null,
        redoOpen: false,
      }),
    ).toBe(false);
  });

  it("does not wait for a photo answer without photos", () => {
    expect(
      answerNeedsGrade({
        question: { type: "image_answer" },
        answer: { type: "image", mediaKeys: [] },
        answeredAt: saved,
        grade: null,
        redoOpen: false,
      }),
    ).toBe(false);
  });

  it("holds a changed answer back while a redo is open", () => {
    expect(
      answerNeedsGrade({
        question: { type: "free_text" },
        answer: { type: "free_text", text: "x" },
        answeredAt: later,
        grade: graded,
        redoOpen: true,
      }),
    ).toBe(false);
  });
});
