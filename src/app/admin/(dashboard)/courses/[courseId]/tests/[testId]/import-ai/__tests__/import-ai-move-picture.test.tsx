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

import { requestUploadSlotsAction } from "../../question-media-actions";
import { parseQuestionsAction, retryQuestionAction } from "../actions";
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
 * Opens the "Move to question" menu of one picture on a card.
 * @param title - The card's question title.
 * @param pictureNumber - The picture's `[image N]` number.
 */
async function openMoveMenu(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  pictureNumber: number,
): Promise<void> {
  await user.click(
    within(questionCard(title)).getByRole("button", {
      name: `Move picture ${pictureNumber} to another question`,
    }),
  );
}

describe("Feature: AI document import — moving a picture between questions", () => {
  it("puts the picture on the chosen question and takes it off the one it came from", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );

    await openMoveMenu(user, "Q1", 1);
    await user.click(await screen.findByRole("menuitem", { name: /#2/ }));

    expect(
      within(questionCard("Q2")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(
      within(questionCard("Q1")).queryByRole("img", { name: "Figure 1" }),
    ).toBeNull();
  });

  it("names both questions on Undo, and one Undo returns the picture to the source while Redo moves it again", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
    await openMoveMenu(user, "Q1", 1);
    await user.click(await screen.findByRole("menuitem", { name: /#2/ }));

    await user.click(
      screen.getByRole("button", {
        name: "Undo move of picture 1 from Question 1 to Question 2",
      }),
    );

    expect(
      within(questionCard("Q1")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(
      within(questionCard("Q2")).queryByRole("img", { name: "Figure 1" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Redo move of picture 1 from Question 1 to Question 2",
      }),
    );
    expect(
      within(questionCard("Q2")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
  });

  it("lists a full question and one that already has the picture as unavailable, and leaves out the picture's own question", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [
        { title: "Q1", imageNumbers: [1] },
        { title: "Q2", imageNumbers: [2, 3, 4] },
        { title: "Q3", imageNumbers: [1] },
        { title: "Q4" },
      ],
      4,
    );

    await openMoveMenu(user, "Q1", 1);

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "#2 Q2 — full",
      "#3 Q3 — already has this picture",
      "#4 Q4",
    ]);
    expect(items[0]).toHaveAttribute("aria-disabled", "true");
    expect(items[1]).toHaveAttribute("aria-disabled", "true");
    expect(items[2]).not.toHaveAttribute("aria-disabled");
  });

  it("disables the Move button when no other question can take the picture", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [
        { title: "Q1", imageNumbers: [1] },
        { title: "Q2", imageNumbers: [1] },
      ],
      1,
    );

    expect(
      within(questionCard("Q1")).getByRole("button", {
        name: "Move picture 1 to another question",
      }),
    ).toBeDisabled();
  });

  it("does not count a move as a hand-edit, so retrying either question asks for no discard confirmation", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
    await openMoveMenu(user, "Q1", 1);
    await user.click(await screen.findByRole("menuitem", { name: /#2/ }));

    for (const title of ["Q1", "Q2"]) {
      await user.click(
        within(questionCard(title)).getByRole("button", {
          name: /retry with ai/i,
        }),
      );
      await user.type(screen.getByLabelText(/what was wrong/i), "Wrong.");
      expect(screen.queryByRole("alert")).toBeNull();
      await user.keyboard("{Escape}");
    }
    expect(retryQuestionAction).not.toHaveBeenCalled();
  });

  it("keeps a moved-in picture through Retry with AI, and Undo of the retry restores the old text", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
    await openMoveMenu(user, "Q1", 1);
    await user.click(await screen.findByRole("menuitem", { name: /#2/ }));
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q2 retried",
        content: "Retried content",
        type: "free_text",
      },
    });

    await user.click(
      within(questionCard("Q2")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Typo.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(
      await within(questionCard("Q2 retried")).findByRole("img", {
        name: "Figure 1",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Undo AI retry of Question 2" }),
    );
    expect(
      within(questionCard("Q2")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Q2 retried")).toBeNull();
  });

  it("keeps a move onto a question whose edit form is open, and the form's Save lands on top", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
    await user.click(
      within(questionCard("Q2")).getByRole("button", { name: "Edit" }),
    );
    await user.type(screen.getByLabelText(/title/i), " typed");

    await openMoveMenu(user, "Q1", 1);
    await user.click(await screen.findByRole("menuitem", { name: /#2/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const target = questionCard("Q2 typed");
    expect(
      within(target).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Undo edit of Question 2" }),
    ).toBeEnabled();
  });

  it("leaves Ctrl+Z to the open Move menu instead of undoing behind it", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1, 2] }, { title: "Q2" }],
      2,
    );
    await user.click(
      within(questionCard("Q1")).getByRole("button", {
        name: "Remove picture 2",
      }),
    );
    await openMoveMenu(user, "Q1", 1);

    const notPrevented = fireEvent.keyDown(screen.getByRole("menu"), {
      key: "z",
      ctrlKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(
      screen.getByRole("button", {
        name: "Undo removing picture 2 from Question 1",
        hidden: true,
      }),
    ).toBeEnabled();
  });

  it("locks the Move button while a new file is read", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
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
      within(questionCard("Q1")).getByRole("button", {
        name: "Move picture 1 to another question",
      }),
    ).toBeDisabled();
  });

  it("locks the Move button while the import writes", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [{ title: "Q1", imageNumbers: [1] }, { title: "Q2" }],
      1,
    );
    // The picture upload never finishes, which holds the screen in the importing phase.
    vi.mocked(requestUploadSlotsAction).mockReturnValueOnce(
      new Promise(() => {}),
    );

    await user.click(screen.getByRole("button", { name: "Import questions" }));

    expect(
      within(questionCard("Q1")).getByRole("button", {
        name: "Move picture 1 to another question",
      }),
    ).toBeDisabled();
  });
});
