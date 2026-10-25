// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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

import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
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

describe("Feature: AI document import — deleting a draft question", () => {
  it("removes the card at once, names the delete on Undo and moves focus there", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);

    await user.click(screen.getByRole("button", { name: "Delete question 2" }));

    expect(screen.queryByText("Q2")).not.toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    const undo = screen.getByRole("button", {
      name: "Undo delete of Question 2",
    });
    expect(undo).toHaveFocus();
  });

  it("brings a deleted draft back in its place with its edits and pictures, and focuses it", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1" }, { title: "Q2", imageNumbers: [2] }, { title: "Q3" }],
      2,
    );
    await renameQuestion(user, "Q2", "Q2 reworded");

    await user.click(screen.getByRole("button", { name: "Delete question 2" }));
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 2" }),
    );

    const restored = questionCard("Q2 reworded");
    expect(
      within(restored).getByRole("button", { name: "Delete question 2" }),
    ).toBeInTheDocument();
    expect(
      within(restored).getByRole("img", { name: "Figure 2" }),
    ).toBeInTheDocument();
    expect(restored).toHaveFocus();
  });

  it("keeps what is typed in another card's open edit form when the first question is deleted", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await user.click(
      within(questionCard("Q2")).getByRole("button", { name: "Edit" }),
    );
    await user.type(screen.getByLabelText(/title/i), " typed");

    await user.click(screen.getByRole("button", { name: "Delete question 1" }));

    expect(screen.getByLabelText(/title/i)).toHaveValue("Q2 typed");
  });

  it("stays in Student view when the teacher undoes a delete from there", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    await user.click(screen.getByRole("button", { name: "Student view" }));

    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 1" }),
    );

    const student = screen.getByRole("region", { name: "Student view" });
    expect(within(student).getByText("Q1 content")).toBeInTheDocument();
  });

  it("deletes a draft on Redo even with its edit form open, dropping the typing and unlocking Import", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 1" }),
    );
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    await user.type(screen.getByLabelText(/title/i), " typed");

    await user.click(
      screen.getByRole("button", { name: "Redo delete of Question 1" }),
    );

    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Q1 typed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 1" }),
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("lists a deleted draft's pictures as unused, and takes them back with Undo", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1" }, { title: "Q2", imageNumbers: [1] }],
      1,
    );
    expect(
      screen.queryByRole("region", { name: "Unused pictures" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Delete question 2" }));

    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).getByAltText("Unused picture 1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 2" }),
    );
    expect(
      screen.queryByRole("region", { name: "Unused pictures" }),
    ).toBeNull();
  });

  it("locks Delete while a new file is read", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    vi.mocked(parseQuestionsAction).mockReturnValueOnce(new Promise(() => {}));

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Read and replace" }));
    await screen.findByRole("status");

    expect(
      screen.getByRole("button", { name: "Delete question 1" }),
    ).toBeDisabled();
  });

  it("locks Delete while the import writes", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);
    vi.mocked(importAiQuestionsAction).mockReturnValueOnce(
      new Promise(() => {}),
    );

    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect(
      screen.getByRole("button", { name: "Delete question 1" }),
    ).toBeDisabled();
  });

  it("keeps the review screen with an empty-state line and Undo when every question is deleted, and Undo brings the last one back", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }, { title: "Q2" }]);

    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));

    expect(
      screen.getByText("All questions deleted. Undo to bring them back."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 questions found/)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 1" }),
    );
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("1 question found")).toBeInTheDocument();
  });

  it("still counts as work on screen when every question is deleted: the browser warns and a new file asks first", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }]);
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    expect(unload.defaultPrevented).toBe(true);
    expect(
      screen.getByRole("alertdialog", {
        name: "Replace the questions on screen?",
      }),
    ).toBeInTheDocument();
  });

  it("disables Import and Replace when every question is deleted, until Undo brings one back", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ title: "Q1" }]);
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));

    expect(
      screen.getByRole("button", { name: "Import questions" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /replace/i }));
    expect(
      screen.getByRole("button", { name: "Replace questions" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Undo delete of Question 1" }),
    );
    expect(
      screen.getByRole("button", { name: "Replace questions" }),
    ).toBeEnabled();
  });
});
