// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
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

import type { RequestUploadSlotsInput } from "../../question-media.schema";
import { requestUploadSlotsAction } from "../../question-media-actions";
import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";
import { cardTitleText, questionCard } from "./review-card.helpers";

beforeEach(() => {
  // jsdom has no object URLs; name each preview after its file.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

/**
 * Renders the import page and uploads a document with two pictures whose
 * AI result is one question holding both, and a second without pictures.
 */
async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "document text",
    pictures: [1, 2].map((number) => ({
      number,
      file: new File([`png-${number}`], `picture-${number}.png`, {
        type: "image/png",
      }),
    })),
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: "Extracted 2 question(s)",
    questions: [
      {
        title: "Q1",
        content: "Q1 content",
        type: "free_text",
        imageNumbers: [1, 2],
      },
      { title: "Q2", content: "Q2 content", type: "free_text" },
    ],
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
  await screen.findByText(cardTitleText("Q1"));
}

/** Grants a slot for every requested file, keyed by its file name. */
function grantSlots(): void {
  vi.mocked(requestUploadSlotsAction).mockImplementation(
    async (files: RequestUploadSlotsInput[]) => ({
      success: true,
      message: "Upload slots created",
      slots: files.map((file, i) => ({
        key: `media/questions/${file.fileName}`,
        url: `https://fake-s3.local/put/${file.fileName}`,
        contentType: file.contentType,
        order: i,
      })),
    }),
  );
}

describe("Feature: AI document import — a teacher changes a draft's pictures in the Edit modal", () => {
  it("shows the removed and added pictures after one Save, restores them on Undo, and imports the added file", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);

    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 1 from this question",
      }),
    );
    await user.upload(
      within(dialog).getByLabelText("Add a picture file"),
      new File(["new"], "new.png", { type: "image/png" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const card = questionCard("Q1");
    expect(within(card).queryByAltText("Figure 1")).not.toBeInTheDocument();
    expect(within(card).getByAltText("Figure 2")).toBeInTheDocument();
    expect(within(card).getByAltText("Figure 3")).toBeInTheDocument();
    // The saved file's preview now belongs to the review list.
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:new.png");

    // One Undo restores the old set; the added picture is left unused.
    await user.click(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    );
    expect(within(questionCard("Q1")).getByAltText("Figure 1")).toBeVisible();
    expect(screen.getByAltText("Unused picture 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:new.png");

    await user.click(
      screen.getByRole("button", { name: "Redo edit of Question 1" }),
    );
    grantSlots();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , reviewed] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(reviewed[0].media?.map((entry) => entry.key)).toEqual([
      "media/questions/picture-2.png",
      "media/questions/new.png",
    ]);
  });

  it("marks a draft hand-edited when only its pictures changed, so Retry with AI warns before replacing it", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);

    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 1 from this question",
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    ).toBeEnabled();

    await user.click(
      within(questionCard("Q1")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");

    expect(await screen.findByRole("alert")).toHaveTextContent(/hand-edited/i);
  });

  it("frees a picked file's preview when it is removed in the modal, and frees its slot for another file", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText("Add a picture file");
    await user.upload(
      picker,
      new File(["new"], "new.png", { type: "image/png" }),
    );
    expect(picker).toBeDisabled();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 3 from this question",
      }),
    );

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:new.png");
    expect(within(dialog).queryByAltText("Figure 3 in the edit")).toBeNull();
    expect(picker).toBeEnabled();
  });

  it("warns about [image N] by the modal's own pictures: a removed picture's number warns, an added picture's number does not", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    const title = within(dialog).getByLabelText(/title/i);
    await user.clear(title);
    await user.type(title, "[[image 1]");
    expect(within(dialog).getByText("Shows as Picture 1")).toBeVisible();

    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 1 from this question",
      }),
    );
    expect(
      within(dialog).getByText("Names a picture this question does not have"),
    ).toBeVisible();

    await user.upload(
      within(dialog).getByLabelText("Add a picture file"),
      new File(["new"], "new.png", { type: "image/png" }),
    );
    await user.clear(title);
    await user.type(title, "[[image 3]");
    expect(
      within(dialog).queryByText("Names a picture this question does not have"),
    ).toBeNull();
    expect(within(dialog).getByText("Shows as Picture 2")).toBeVisible();
  });

  it("gives a re-picked file a fresh number, never the one of the file removed before it", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText("Add a picture file");
    await user.upload(picker, new File(["a"], "a.png", { type: "image/png" }));
    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 3 from this question",
      }),
    );
    await user.upload(picker, new File(["b"], "b.png", { type: "image/png" }));

    expect(
      within(dialog).getByRole("button", {
        name: "Remove picture 4 from this question",
      }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("button", {
        name: "Remove picture 3 from this question",
      }),
    ).toBeNull();
  });

  it("numbers a new picture above any number a draft already claims, even one the document lacks", async () => {
    const user = userEvent.setup();
    // Q2's AI result names a picture 3 the document does not have.
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 2 question(s)",
      questions: [
        { title: "Q1", content: "Q1 content", type: "free_text" },
        {
          title: "Q2",
          content: "Q2 content",
          type: "free_text",
          imageNumbers: [3],
        },
      ],
    });
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.upload(
      within(dialog).getByLabelText("Add a picture file"),
      new File(["new"], "new.png", { type: "image/png" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(within(questionCard("Q1")).getByAltText("Figure 4")).toBeVisible();
    expect(within(questionCard("Q2")).queryByRole("img")).toBeNull();
  });

  it("refuses non-image and oversized files, stops at three pictures, and frees a picked preview on Cancel", async () => {
    // The picker's accept filter would hide the bad files from the test otherwise.
    const user = userEvent.setup({ applyAccept: false });
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText("Add a picture file");

    await user.upload(
      picker,
      new File(["clip"], "clip.mp4", { type: "video/mp4" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /png, jpeg or webp/i,
    );
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(picker, big);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/10 MB/);

    await user.upload(
      picker,
      new File(["new"], "new.png", { type: "image/png" }),
    );
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(picker).toBeDisabled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:new.png");
    expect(within(questionCard("Q1")).queryByAltText("Figure 3")).toBeNull();
  });

  it("counts a removed picture as an unsaved change when the modal is closed", async () => {
    const user = userEvent.setup();
    await uploadDocument(user);
    await user.click(
      within(questionCard("Q1")).getByRole("button", { name: "Edit" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", {
        name: "Remove picture 1 from this question",
      }),
    );

    await user.keyboard("{Escape}");

    expect(
      await screen.findByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeInTheDocument();
  });
});
