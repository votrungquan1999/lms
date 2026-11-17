// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

import {
  cardTitleText,
  questionCard,
  uploadDrafts,
} from "./review-card.helpers";

afterEach(() => {
  vi.resetAllMocks();
});

describe("Feature: AI document import — a teacher edits a draft in an Edit modal", () => {
  it("opens the form in a dialog, saves one change that closes it, and Undo restores the old title", async () => {
    const user = userEvent.setup();
    await uploadDrafts(user, [
      { title: "Q1", content: "First", type: "free_text" },
      { title: "Q2", content: "Second", type: "free_text" },
    ]);

    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit question 1",
    });
    const title = within(dialog).getByLabelText(/title/i);
    await user.clear(title);
    await user.type(title, "Q1 reworded");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(cardTitleText("Q1 reworded"))).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    );
    expect(screen.getByText(cardTitleText("Q1"))).toBeInTheDocument();
  });

  it('asks "Discard your changes?" on Escape, drops the typing on Discard, and closes straight away when nothing changed, an erased blank field included', async () => {
    // Given: an open modal with a retitled, unsaved draft
    const user = userEvent.setup();
    await uploadDrafts(user, [
      { title: "Q1", content: "First", type: "free_text" },
    ]);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByLabelText(/title/i);
    await user.type(title, " typed");

    // When: the teacher presses Escape and discards
    await user.keyboard("{Escape}");
    await user.click(await screen.findByRole("button", { name: "Discard" }));

    // Then: the modal is gone and the draft is unchanged
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(cardTitleText("Q1"))).toBeInTheDocument();

    // When: the modal is reopened, a model answer typed and erased, and closed
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    expect(await screen.findByLabelText(/title/i)).toHaveValue("Q1");
    const modelAnswer = screen.getByLabelText(/model answer/i);
    await user.type(modelAnswer, "x");
    await user.type(modelAnswer, "{Backspace}");
    await user.keyboard("{Escape}");

    // Then: it closes without asking
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
