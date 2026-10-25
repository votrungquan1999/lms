// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  importAiQuestionsAction,
  parseQuestionsAction,
  retryQuestionAction,
} from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";
import { questionCard } from "./review-card.helpers";

beforeEach(() => {
  // jsdom has no object URLs; name each preview after its file.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

/** One AI-made draft in the shape the parse action returns. */
interface DraftSpec {
  title: string;
  imageNumbers?: number[];
}

/**
 * Renders the import page and uploads a document whose AI result is the given drafts.
 * @param drafts - The drafts the AI returns, in order.
 * @param pictureCount - How many pictures the document holds, numbered from 1.
 */
async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
  drafts: DraftSpec[],
  pictureCount = 0,
): Promise<void> {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "document text",
    pictures: Array.from({ length: pictureCount }, (_, i) => ({
      number: i + 1,
      file: new File([`png-${i + 1}`], `picture-${i + 1}.png`, {
        type: "image/png",
      }),
    })),
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: `Extracted ${drafts.length} question(s)`,
    questions: drafts.map((draft) => ({
      title: draft.title,
      content: `${draft.title} content`,
      type: "free_text" as const,
      imageNumbers: draft.imageNumbers,
    })),
  });

  render(
    <ImportAiProvider>
      <ImportAiFilePicker />
      <QuestionPreviewList
        testId="test-1"
        courseId="course-1"
        existingQuestionCount={0}
        answeredStudentCount={0}
      />
    </ImportAiProvider>,
  );

  await user.upload(
    screen.getByLabelText(/document/i),
    new File(["docx"], "exam.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  await screen.findByText(drafts[0].title);
}

/**
 * Renames a question through its edit form and saves.
 * @param from - The question's current title.
 * @param to - The new title.
 */
async function renameQuestion(
  user: ReturnType<typeof userEvent.setup>,
  from: string,
  to: string,
): Promise<void> {
  await user.click(
    within(questionCard(from)).getByRole("button", { name: "Edit" }),
  );
  const title = screen.getByLabelText(/title/i);
  await user.clear(title);
  await user.type(title, to);
  await user.click(screen.getByRole("button", { name: "Save" }));
}

/**
 * Retries one question with the AI through its dialog.
 * @param title - The question's current title.
 */
async function retryQuestion(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
): Promise<void> {
  await user.click(
    within(questionCard(title)).getByRole("button", {
      name: /retry with ai/i,
    }),
  );
  await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
  await user.click(screen.getByRole("button", { name: /^retry$/i }));
}

describe("Feature: AI document import — undo and redo draft changes", () => {
  it("undoes a saved edit, bringing the previous text back", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^undo/i }));

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByText("Q1 reworded")).toBeNull();
  });

  it("redoes an undone edit", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));

    await user.click(screen.getByRole("button", { name: /^redo/i }));

    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
    expect(screen.queryByText("Q1")).toBeNull();
  });

  it("drops the undone changes when a new change is made", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));

    await renameQuestion(user, "Q2", "Q2 reworded");
    await user.click(screen.getByRole("button", { name: /^redo/i }));

    // Redo has nothing left to bring back
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByText("Q1 reworded")).toBeNull();
    expect(screen.getByText("Q2 reworded")).toBeInTheDocument();
  });

  it("undoes removing a picture from a question", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1", imageNumbers: [1] }], 1);
    await user.click(screen.getByRole("button", { name: "Remove picture 1" }));
    expect(screen.getByAltText("Unused picture 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^undo/i }));

    expect(
      within(questionCard("Q1")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByAltText("Unused picture 1")).toBeNull();
  });

  it("undoes adding an unused picture to a question", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }], 1);
    await user.selectOptions(
      screen.getByLabelText("Question for picture 1"),
      "#1 Q1",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 1" }));
    expect(
      within(questionCard("Q1")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^undo/i }));

    expect(within(questionCard("Q1")).queryByRole("img")).toBeNull();
    expect(screen.getByAltText("Unused picture 1")).toBeInTheDocument();
  });

  it("undoes an AI retry, bringing back the draft and its pictures as they were", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1", imageNumbers: [1] }], 2);
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q1 retried",
        content: "Retried content",
        type: "free_text",
        imageNumbers: [2],
      },
    });
    await retryQuestion(user, "Q1");
    expect(
      await within(questionCard("Q1 retried")).findByRole("img", {
        name: "Figure 2",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^undo/i }));

    expect(
      within(questionCard("Q1")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Q1 retried")).toBeNull();
    expect(screen.getByAltText("Unused picture 2")).toBeInTheDocument();
  });

  it("records nothing when an edit form is saved unchanged: Redo stays and the draft is not marked hand-edited", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));

    // When Q2's edit form is saved without touching anything
    await user.click(
      within(questionCard("Q2")).getByRole("button", { name: "Edit" }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Then Redo still brings back the earlier change
    await user.click(screen.getByRole("button", { name: /^redo/i }));
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();

    // And a retry of Q2 does not warn about discarding edits
    await user.click(
      within(questionCard("Q2")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeVisible();
    expect(screen.queryByText(/hand-edited/i)).toBeNull();
  });

  it("names the change and its question number on the buttons, and disables them when there is nothing to act on", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    await renameQuestion(user, "Q2", "Q2 reworded");
    expect(
      screen.getByRole("button", { name: "Undo edit of Question 2" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Undo edit of Question 2" }),
    );
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Redo edit of Question 2" }),
    ).toBeEnabled();
  });

  it("names a picture change with the picture and the question it touches", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1" }, { title: "Q2", imageNumbers: [1] }],
      1,
    );

    await user.click(screen.getByRole("button", { name: "Remove picture 1" }));
    expect(
      screen.getByRole("button", {
        name: "Undo removing picture 1 from Question 2",
      }),
    ).toBeEnabled();

    await user.selectOptions(
      screen.getByLabelText("Question for picture 1"),
      "#1 Q1",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 1" }));
    expect(
      screen.getByRole("button", {
        name: "Undo adding picture 1 to Question 1",
      }),
    ).toBeEnabled();
  });

  it("treats an AI retry result as a new change that drops the undone ones", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));
    expect(
      screen.getByRole("button", { name: "Redo edit of Question 1" }),
    ).toBeEnabled();

    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: { title: "Q2 retried", content: "New", type: "free_text" },
    });
    await retryQuestion(user, "Q2");
    await screen.findByText("Q2 retried");

    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Undo AI retry of Question 2" }),
    ).toBeEnabled();
  });

  it("takes the hand-edit mark away with an undone edit, so retry stops warning, and puts it back on redo", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));

    // Without the edit, the retry dialog goes straight to the Retry button
    await user.click(
      within(questionCard("Q1")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    expect(screen.queryByText(/hand-edited/i)).toBeNull();
    await user.keyboard("{Escape}");

    // With the edit redone, the warning is back
    await user.click(screen.getByRole("button", { name: /^redo/i }));
    await user.click(
      within(questionCard("Q1 reworded")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    expect(screen.getByText(/hand-edited/i)).toBeVisible();
  });

  it("locks Undo and Redo while a new file is read", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await renameQuestion(user, "Q2", "Q2 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));
    vi.mocked(parseQuestionsAction).mockReturnValueOnce(new Promise(() => {}));

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Read and replace" }));
    await screen.findByRole("status");

    expect(screen.getByRole("button", { name: /^undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^redo/i })).toBeDisabled();
  });

  it("locks Undo and Redo while the import writes", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await renameQuestion(user, "Q2", "Q2 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));
    vi.mocked(importAiQuestionsAction).mockReturnValueOnce(
      new Promise(() => {}),
    );

    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect(screen.getByRole("button", { name: /^undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^redo/i })).toBeDisabled();
  });

  it("keeps Undo available while a question is being retried", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    vi.mocked(retryQuestionAction).mockReturnValueOnce(new Promise(() => {}));

    await retryQuestion(user, "Q2");
    await screen.findByRole("button", { name: "Retrying…" });

    // The retry dialog covers the page, so the button is hidden from the accessibility tree.
    expect(
      screen.getByRole("button", {
        name: "Undo edit of Question 1",
        hidden: true,
      }),
    ).toBeEnabled();
  });

  it("starts a fresh history when a new file is read", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(screen.getByRole("button", { name: /^undo/i }));
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Fresh", content: "Fresh content", type: "free_text" },
      ],
    });

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Read and replace" }));
    await screen.findByText("Fresh");

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("does not undo the Add/Replace choice", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await user.click(
      screen.getByRole("radio", {
        name: "Replace the test's existing questions",
      }),
    );
    await renameQuestion(user, "Q1", "Q1 reworded");

    await user.click(screen.getByRole("button", { name: /^undo/i }));

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: "Replace the test's existing questions",
      }),
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("keeps what is typed in an open edit form through Undo and Redo, and Save lands on top of the history", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(
      within(questionCard("Q2")).getByRole("button", { name: "Edit" }),
    );
    await user.type(screen.getByLabelText(/title/i), " typed");

    await user.click(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Redo edit of Question 1" }),
    );

    // The form kept its typing while the list changed underneath it
    expect(screen.getByLabelText(/title/i)).toHaveValue("Q2 typed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Q2 typed")).toBeInTheDocument();
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo edit of Question 2" }),
    ).toBeEnabled();
  });
});

describe("Feature: AI document import — undo and redo from the keyboard", () => {
  it("undoes the latest change on Ctrl+Z", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");

    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByText("Q1 reworded")).not.toBeInTheDocument();
  });

  it("undoes the latest change on Cmd+Z", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");

    await user.keyboard("{Meta>}z{/Meta}");

    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("redoes the undone change on Ctrl+Shift+Z and on Cmd+Shift+Z", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await renameQuestion(user, "Q2", "Q2 reworded");
    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}z{/Control}");

    await user.keyboard("{Control>}{Shift>}Z{/Shift}{/Control}");
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
    await user.keyboard("{Meta>}{Shift>}Z{/Shift}{/Meta}");

    expect(screen.getByText("Q2 reworded")).toBeInTheDocument();
  });

  it("leaves Ctrl+Z to the browser's own typing undo inside a text box", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(
      within(questionCard("Q2")).getByRole("button", { name: "Edit" }),
    );

    const notPrevented = fireEvent.keyDown(screen.getByLabelText(/title/i), {
      key: "z",
      ctrlKey: true,
    });
    const alsoInTextarea = fireEvent.keyDown(
      screen.getByLabelText(/content/i),
      {
        key: "z",
        ctrlKey: true,
      },
    );

    expect(notPrevented).toBe(true);
    expect(alsoInTextarea).toBe(true);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    ).toBeEnabled();
  });

  it("ignores the shortcut while the retry dialog is open", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await user.click(
      within(questionCard("Q2")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );

    const notPrevented = fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "z",
      ctrlKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Undo edit of Question 1",
        hidden: true,
      }),
    ).toBeEnabled();
  });

  it("does not repeat while the keys are held down", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");

    const notPrevented = fireEvent.keyDown(document.body, {
      key: "z",
      ctrlKey: true,
      repeat: true,
    });

    expect(notPrevented).toBe(true);
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
  });

  it("ignores Ctrl+Alt+Z, which other layouts use for typing a character", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");

    const notPrevented = fireEvent.keyDown(document.body, {
      key: "z",
      ctrlKey: true,
      altKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
  });

  it("works with focus on the file input right after an upload and on a radio", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    await renameQuestion(user, "Q2", "Q2 reworded");
    screen.getByLabelText(/document/i).focus();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByText("Q2")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /replace/i }));
    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /replace/i })).toBeChecked();
  });

  it("does nothing while a new file is read", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await renameQuestion(user, "Q1", "Q1 reworded");
    vi.mocked(parseQuestionsAction).mockReturnValueOnce(new Promise(() => {}));
    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Read and replace" }));
    await screen.findByRole("status");

    const notPrevented = fireEvent.keyDown(document.body, {
      key: "z",
      ctrlKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(screen.getByText("Q1 reworded")).toBeInTheDocument();
  });

  it("brings back the only draft on Ctrl+Z after it was deleted", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }]);
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));

    await user.keyboard("{Control>}z{/Control}");

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(questionCard("Q1")).toHaveFocus();
  });
});
