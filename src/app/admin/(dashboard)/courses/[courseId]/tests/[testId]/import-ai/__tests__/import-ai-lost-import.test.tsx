// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
}));
vi.mock("../read-failure-actions", () => ({
  reportDocumentReadFailureAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { questionCard, uploadDrafts } from "./review-card.helpers";

afterEach(() => {
  vi.resetAllMocks();
});

const DRAFTS = [
  {
    title: "Q1",
    content: "Explain photosynthesis.",
    type: "free_text" as const,
  },
  { title: "Q2", content: "Name a prime.", type: "free_text" as const },
];

/**
 * Reads two drafts and clicks Import against a server that never answers.
 * @param user - The user-event instance driving the page.
 */
async function loseAddImport(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  vi.mocked(importAiQuestionsAction).mockRejectedValue(
    new TypeError("Failed to fetch"),
  );
  await uploadDrafts(user, DRAFTS);
  await user.click(screen.getByRole("button", { name: "Import questions" }));
  await screen.findByRole("alert");
}

describe("Feature: AI document import — an Add import whose call never answered is not repeated blindly", () => {
  it("keeps the list, locks Import, links to the test page, and unlocks once the teacher confirms nothing was added", async () => {
    const user = userEvent.setup();

    await loseAddImport(user);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(/may have been added/i);
    expect(
      within(banner).getByRole("link", { name: "Open the test page" }),
    ).toHaveAttribute("href", "/admin/courses/course-1/tests/test-1");
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeDisabled();
    expect(push).not.toHaveBeenCalled();

    await user.click(
      within(banner).getByRole("button", {
        name: "I checked the test page — nothing was added",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeEnabled();
  });

  it("leaves Replace unlocked after its call never answered, since a repeat deletes before it writes", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    await uploadDrafts(user, DRAFTS);
    await user.click(screen.getByRole("radio", { name: /replace/i }));
    await user.click(screen.getByRole("button", { name: "Replace questions" }));
    await user.type(
      await screen.findByLabelText(/type.*override.*to confirm/i),
      "override",
    );
    await user.click(screen.getByRole("button", { name: "Yes, replace" }));

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(
      "The import didn't finish because the connection to the server failed. Open the test page to check its questions before trying again.",
    );
    expect(
      within(banner).queryByRole("button", { name: /nothing was added/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Replace questions" }),
    ).toBeEnabled();
  });

  it("keeps Add locked through edits, Undo and Redo", async () => {
    const user = userEvent.setup();
    await loseAddImport(user);

    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const title = screen.getByLabelText(/title/i);
    await user.clear(title);
    await user.type(title, "Q1 fixed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^undo/i }));
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^redo/i }));
    expect(screen.getByText("Q1 fixed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeDisabled();
  });

  it("unlocks Add when the teacher reads a new file", async () => {
    const user = userEvent.setup();
    await loseAddImport(user);
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "New A", content: "Define a cell.", type: "free_text" },
      ],
    });

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["dummy"], "week-2.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Read and replace" }),
    );

    expect(await screen.findByText("New A")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
