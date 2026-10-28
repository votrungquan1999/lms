// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
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
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

/**
 * Renders the import page and uploads a document whose AI result is the given drafts.
 * @param user - The user-event instance driving the page.
 * @param drafts - The drafts the AI returns, in order.
 * @param pictureCount - How many pictures the document holds, numbered from 1.
 */
async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
  drafts: ParsedQuestion[],
  pictureCount: number,
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
    questions: drafts,
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
  await screen.findByRole("heading", { name: /found$/ });
}

/**
 * A picture-choice question as the read returns it: pictures 4-6 attached, each choice only a marker.
 * @returns The draft.
 */
function pictureChoiceQuestion(): ParsedQuestion {
  return {
    title: "Câu 2",
    content: "Hình nào là tế bào thực vật?",
    type: "single_select",
    options: [
      { text: "[image 4]", isCorrect: true },
      { text: "[image 5]", isCorrect: false },
      { text: "[image 6]", isCorrect: false },
    ],
    imageNumbers: [4, 5, 6],
  };
}

describe("Feature: AI document import — pictures are named by their place in the question", () => {
  it('captions each picture on a review card "Picture k", counting only that question\'s pictures', async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [
        {
          title: "Câu 1",
          content: "Hình nào?",
          type: "free_text",
          imageNumbers: [2, 3],
        },
      ],
      3,
    );

    const card = questionCard("Câu 1");
    expect(within(card).getByText("Picture 1")).toBeVisible();
    expect(within(card).getByText("Picture 2")).toBeVisible();
    expect(within(card).queryByText("Picture 3")).toBeNull();
  });

  it('shows a choice that is only a picture marker as "Picture k", k being that picture\'s place in the question', async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [pictureChoiceQuestion()], 6);

    const card = questionCard("Câu 2");
    const choices = within(card).getAllByRole("listitem");
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "✓Picture 1",
      "○Picture 2",
      "○Picture 3",
    ]);
    expect(within(card).queryByText(/\[image/)).toBeNull();
  });

  it('shows a title or content that is only markers by its pictures\' places, several as "Pictures k, m"', async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      [
        {
          title: "[image 3]",
          content: "[image 3] [image 2]",
          type: "free_text",
          imageNumbers: [2, 3],
        },
      ],
      3,
    );

    const card = screen
      .getByText("#1")
      .closest('[data-slot="card"]') as HTMLElement;
    expect(within(card).getByText("Pictures 2, 1")).toBeVisible();
    // The caption under the second picture and the title both read "Picture 2".
    expect(within(card).getAllByText("Picture 2")).toHaveLength(2);
    expect(within(card).queryByText(/\[image/)).toBeNull();
  });

  it('shows a picture choice in Student view by the same "Picture k" the student sees under the picture', async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [pictureChoiceQuestion()], 6);

    await user.click(screen.getByRole("button", { name: "Student view" }));

    const student = within(
      screen.getByRole("region", { name: "Student view" }),
    );
    expect(student.getByRole("radio", { name: "Picture 1" })).toBeVisible();
    expect(student.getByRole("radio", { name: "Picture 3" })).toBeVisible();
    expect(student.getByRole("img", { name: "Picture 1" })).toHaveAttribute(
      "src",
      "blob:picture-4.png",
    );
  });

  it("keeps the marker in the edit field and says under it which picture students will see", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [pictureChoiceQuestion()], 6);

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const firstChoice = screen.getByLabelText("Option 1 text");
    expect(firstChoice).toHaveValue("[image 4]");
    expect(firstChoice).toHaveAccessibleDescription("Shows as Picture 1");
    expect(screen.getByLabelText("Title")).not.toHaveAccessibleDescription();
  });

  it("warns when a choice names a picture the question no longer has, refuses Import on that card without uploading, and Undo of the move clears the warning", async () => {
    const user = userEvent.setup();
    const freeText: ParsedQuestion = {
      title: "Câu 1",
      content: "Mô tả",
      type: "free_text",
    };
    await uploadDocument(user, [freeText, pictureChoiceQuestion()], 6);

    // When the teacher moves picture 4 onto question 1
    await user.click(
      within(questionCard("Câu 2")).getByRole("button", {
        name: "Move picture 4 to another question",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /#1/ }));

    // Then the card warns, and the choice still shows the marker it holds
    const warning =
      "Option 1 names a picture this question no longer has. Move the picture back or edit the option to import it.";
    expect(within(questionCard("Câu 2")).getByText(warning)).toBeVisible();
    expect(within(questionCard("Câu 2")).getByText("[image 4]")).toBeVisible();

    // And Import is refused on that card before any upload
    await user.click(screen.getByRole("button", { name: "Import questions" }));
    expect(
      await within(questionCard("Câu 2")).findByRole("alert"),
    ).toHaveTextContent(
      "Question 2 — Option 1 names a picture this question no longer has",
    );
    expect(requestUploadSlotsAction).not.toHaveBeenCalled();
    expect(importAiQuestionsAction).not.toHaveBeenCalled();

    // When the move is undone, the warning goes
    await user.click(screen.getByRole("button", { name: /^undo/i }));
    expect(within(questionCard("Câu 2")).queryByText(warning)).toBeNull();
  });

  it('saves a picture choice as the "Picture k" students see, not the document\'s marker', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockImplementation(async (files) => ({
      success: true,
      message: "Upload slots created",
      slots: files.map((file, order) => ({
        key: `media/questions/${file.fileName}`,
        url: `https://fake-s3.local/put/${file.fileName}`,
        contentType: file.contentType,
        order,
      })),
    }));
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 1 question(s)",
      importedCount: 1,
    });
    await uploadDocument(user, [pictureChoiceQuestion()], 6);

    await user.click(screen.getByRole("button", { name: "Import questions" }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , [saved]] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(saved.title).toBe("Câu 2");
    expect(saved.options?.map((option) => option.text)).toEqual([
      "Picture 1",
      "Picture 2",
      "Picture 3",
    ]);
    expect(saved.media?.map((media) => media.fileName)).toEqual([
      "picture-4.png",
      "picture-5.png",
      "picture-6.png",
    ]);
  });

  it("never attaches a picture for a marker the teacher types: the choice warns instead", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [pictureChoiceQuestion()], 6);

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const firstChoice = screen.getByLabelText("Option 1 text");
    await user.clear(firstChoice);
    await user.type(firstChoice, "[[image 1]");
    expect(firstChoice).toHaveAccessibleDescription(
      "Names a picture this question does not have",
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    const card = questionCard("Câu 2");
    expect(within(card).queryByRole("img", { name: "Figure 1" })).toBeNull();
    expect(screen.getByAltText("Unused picture 1")).toBeInTheDocument();
    expect(
      within(card).getByText(
        /^Option 1 names a picture this question no longer has/,
      ),
    ).toBeVisible();
  });
});
