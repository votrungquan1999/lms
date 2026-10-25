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

import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { questionCard, uploadDrafts } from "./review-card.helpers";

afterEach(() => {
  vi.resetAllMocks();
});

const FORMATTED: ParsedQuestion = {
  title: "Formatted",
  content:
    "Pick the **bold** word.\nSecond line\n\n- first item\n- second item",
  type: "free_text",
};

describe("Feature: AI document import — the Teacher view formats question content like the Student view", () => {
  it("shows bold, list items and line breaks in a card's content", async () => {
    const user = userEvent.setup();
    await uploadDrafts(user, [FORMATTED]);

    const card = within(questionCard("Formatted"));

    expect(card.getByText("bold").tagName).toBe("STRONG");
    const items = card.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("first item");
    expect(items[1]).toHaveTextContent("second item");
    expect(
      card
        .getByText(/Pick the/)
        .closest("p")
        ?.querySelector("br"),
    ).not.toBeNull();
  });

  it("lets an unbroken title, content and model answer wrap inside the card", async () => {
    const user = userEvent.setup();
    const unbroken = (label: string) =>
      `${label}${"x".repeat(120)}@example.com`;
    await uploadDrafts(user, [
      {
        title: unbroken("title-"),
        content: unbroken("content-"),
        type: "free_text",
        referenceAnswer: unbroken("answer-"),
      },
    ]);

    const card = within(questionCard(unbroken("title-")));
    const wrapper = (text: string) =>
      card.getByText(unbroken(text)).closest(".prose");

    // Tailwind's wrap-anywhere lowers the minimum width; min-w-0 lets the flex title row shrink.
    expect(card.getByText(unbroken("title-"))).toHaveClass("wrap-anywhere");
    expect(card.getByText(unbroken("title-")).parentElement).toHaveClass(
      "min-w-0",
    );
    expect(wrapper("content-")).toHaveClass("wrap-anywhere");
    expect(wrapper("answer-")).toHaveClass("wrap-anywhere");
  });
});
