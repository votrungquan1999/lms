// @vitest-environment jsdom
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
  retryQuestionAction: vi.fn(),
}));
vi.mock("../../question-media-actions", () => ({
  requestUploadSlotsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

import { cardTitle, questionCard, uploadDrafts } from "./review-card.helpers";

afterEach(() => {
  vi.resetAllMocks();
});

/**
 * Feature: A teacher reviewing an AI import sees each draft as the student will see it
 * As a teacher
 * I want each draft shown as the student card, with the answer key in a teacher strip
 * So that I check what students get and what the key says in one place
 */
describe("Feature: AI import review — drafts shown as the student card plus a teacher strip", () => {
  it("shows a draft's numbered title, with its options, answer key and card actions", async () => {
    // Given: a draft multiple-choice question with an explanation
    const user = userEvent.setup();
    await uploadDrafts(user, [
      {
        title: "Pick the capital",
        content: "Which city is the capital of France?",
        type: "single_select",
        options: [
          { text: "Paris", isCorrect: true },
          { text: "London", isCorrect: false },
        ],
        explanation: "Paris has been the capital for centuries.",
      },
    ]);

    // Then: the card reads "Question 1: <title>" like the student's card
    const card = within(questionCard("Pick the capital"));
    expect(cardTitle("Pick the capital")).toHaveTextContent(
      "Question 1: Pick the capital",
    );
    expect(
      card.getByText("Which city is the capital of France?"),
    ).toBeInTheDocument();

    // And: the teacher strip marks the correct option and shows the explanation
    expect(card.getByText("✓").closest("li")).toHaveTextContent("Paris");
    expect(card.getByText("○").closest("li")).toHaveTextContent("London");
    expect(card.getByText("Explanation")).toBeInTheDocument();
    expect(
      card.getByText("Paris has been the capital for centuries."),
    ).toBeInTheDocument();

    // And: the card keeps its type label and Edit / Delete actions
    expect(card.getByText("Single Select")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      card.getByRole("button", { name: "Delete question 1" }),
    ).toBeInTheDocument();
  });
});
