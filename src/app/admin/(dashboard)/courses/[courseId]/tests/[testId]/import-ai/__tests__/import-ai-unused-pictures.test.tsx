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

import { requestUploadSlotsAction } from "../../question-media-actions";
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

beforeEach(() => {
  // jsdom has no object URLs; name each preview after its file so tests can tell them apart.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

/**
 * Makes a stand-in picture file the way extraction names them.
 * @param number - The picture's `[image N]` number.
 * @returns A small PNG-typed file.
 */
function makePicture(number: number): File {
  return new File([`png-${number}`], `picture-${number}.png`, {
    type: "image/png",
  });
}

/** One AI-made draft in the shape the parse action returns. */
interface DraftSpec {
  title: string;
  imageNumbers?: number[];
}

/**
 * Renders the import page and uploads a document with `pictureCount` pictures
 * whose AI result places the given pictures on the given drafts.
 * @param pictureCount - How many pictures the document holds, numbered from 1.
 * @param drafts - The drafts the AI returns, in order.
 */
async function uploadDocument(
  pictureCount: number,
  drafts: DraftSpec[],
): Promise<void> {
  const user = userEvent.setup();
  vi.mocked(extractDocx).mockResolvedValue({
    text: "document text",
    pictures: Array.from({ length: pictureCount }, (_, i) => ({
      number: i + 1,
      file: makePicture(i + 1),
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
 * Finds one question's review card by its title.
 * @param title - The question's title.
 * @returns The card element.
 */
function questionCard(title: string): HTMLElement {
  return screen.getByText(title).closest('[data-slot="card"]') as HTMLElement;
}

describe("Feature: AI document import — pictures no question uses", () => {
  it("lists, above the questions, every document picture that no question uses", async () => {
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(
      within(unused)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["Unused picture 2", "Unused picture 3"]);
    expect(within(unused).getByAltText("Unused picture 2")).toHaveAttribute(
      "src",
      "blob:picture-2.png",
    );
    // The picture a question uses stays on its card only.
    expect(
      within(questionCard("Câu 14")).getByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
  });

  it("lists a picture again once the teacher removes it from its question", async () => {
    const user = userEvent.setup();
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    await user.click(
      within(questionCard("Câu 14")).getByRole("button", {
        name: "Remove picture 1",
      }),
    );

    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).getByAltText("Unused picture 1")).toBeInTheDocument();
  });

  it("hides the unused pictures in Student view", async () => {
    const user = userEvent.setup();
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    await user.click(screen.getByRole("button", { name: "Student view" }));

    expect(
      screen.queryByRole("region", { name: "Unused pictures" }),
    ).not.toBeInTheDocument();
  });

  it("shows no unused pictures area when every picture is used or the document has none", async () => {
    await uploadDocument(1, [{ title: "Câu 14", imageNumbers: [1] }]);

    expect(
      screen.queryByRole("region", { name: "Unused pictures" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Unused pictures")).not.toBeInTheDocument();
  });

  it("adds an unused picture to the question the teacher picks, and it leaves the unused list", async () => {
    const user = userEvent.setup();
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      "#2 Câu 15",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 2" }));

    expect(
      within(questionCard("Câu 15")).getByRole("img", { name: "Figure 2" }),
    ).toBeInTheDocument();
    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).queryByAltText("Unused picture 2")).toBeNull();
    expect(within(unused).getByAltText("Unused picture 3")).toBeInTheDocument();
  });

  it("does not count an added picture as a hand-edit, so retrying that question asks for no discard confirmation", async () => {
    const user = userEvent.setup();
    await uploadDocument(2, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Câu 15",
        content: "Re-read content",
        type: "free_text",
      },
    });

    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      "#2 Câu 15",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 2" }));
    await user.click(
      within(questionCard("Câu 15")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");

    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(retryQuestionAction).toHaveBeenCalledTimes(1);
  });

  it("shows a hand-added picture in Unused pictures again when the re-read does not keep it", async () => {
    const user = userEvent.setup();
    await uploadDocument(2, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);
    // The re-read marks only picture 1 in Câu 15's text.
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Câu 15",
        content: "Re-read content",
        type: "free_text",
        imageNumbers: [1],
      },
    });
    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      "#2 Câu 15",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 2" }));

    await user.click(
      within(questionCard("Câu 15")).getByRole("button", {
        name: /retry with ai/i,
      }),
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    const card = questionCard("Câu 15");
    expect(
      await within(card).findByRole("img", { name: "Figure 1" }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("img", { name: "Figure 2" })).toBeNull();
    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).getByAltText("Unused picture 2")).toBeInTheDocument();
  });

  it("uploads a picture the teacher added with its question on import, in document order", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [1, 2, 3].map((n) => ({
        key: `media/questions/k${n}.png`,
        url: `https://fake-s3.local/put/k${n}`,
        contentType: "image/png",
        order: n - 1,
      })),
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 2 question(s)",
      importedCount: 2,
    });
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    // Added out of order: picture 3 first, then 2.
    for (const number of [3, 2]) {
      await user.selectOptions(
        screen.getByLabelText(`Question for picture ${number}`),
        "#1 Câu 14",
      );
      await user.click(
        screen.getByRole("button", { name: `Add picture ${number}` }),
      );
    }
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestUploadSlotsAction).toHaveBeenCalledWith([
      { fileName: "picture-1.png", contentType: "image/png", size: 5 },
      { fileName: "picture-2.png", contentType: "image/png", size: 5 },
      { fileName: "picture-3.png", contentType: "image/png", size: 5 },
    ]);
    expect(importAiQuestionsAction).toHaveBeenCalledWith(
      "test-1",
      "course-1",
      [
        expect.objectContaining({
          title: "Câu 14",
          media: [
            expect.objectContaining({ fileName: "picture-1.png", order: 0 }),
            expect.objectContaining({ fileName: "picture-2.png", order: 1 }),
            expect.objectContaining({ fileName: "picture-3.png", order: 2 }),
          ],
        }),
        expect.objectContaining({ title: "Câu 15", media: [] }),
      ],
      "append",
    );
  });

  it("keeps a picture added while a question's edit form was open when the teacher saves the edit", async () => {
    const user = userEvent.setup();
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);
    await user.click(
      within(questionCard("Câu 14")).getByRole("button", { name: "Edit" }),
    );

    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      "#1 Câu 14",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 2" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      within(questionCard("Câu 14")).getByRole("img", { name: "Figure 2" }),
    ).toBeInTheDocument();
    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).queryByAltText("Unused picture 2")).toBeNull();
  });

  it("keeps Add and Remove disabled while the import uploads, so the uploaded pictures can't change", async () => {
    const user = userEvent.setup();
    let failUpload: () => void = () => {};
    vi.mocked(requestUploadSlotsAction).mockReturnValue(
      new Promise((resolve) => {
        failUpload = () =>
          resolve({ success: false, message: "Upload refused" });
      }),
    );
    await uploadDocument(3, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);
    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      "#2 Câu 15",
    );

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    expect(
      screen.getByRole("button", { name: "Add picture 2" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove picture 1" }),
    ).toBeDisabled();

    failUpload();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add picture 2" }),
      ).toBeEnabled(),
    );
    expect(
      screen.getByRole("button", { name: "Remove picture 1" }),
    ).toBeEnabled();
  });

  it("keeps Retry with AI disabled while the import uploads, and enables it again after a failed upload", async () => {
    const user = userEvent.setup();
    let failUpload: () => void = () => {};
    vi.mocked(requestUploadSlotsAction).mockReturnValue(
      new Promise((resolve) => {
        failUpload = () =>
          resolve({ success: false, message: "Upload refused" });
      }),
    );
    await uploadDocument(2, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15" },
    ]);

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    for (const retry of screen.getAllByRole("button", {
      name: /retry with ai/i,
    })) {
      expect(retry).toBeDisabled();
    }

    failUpload();

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /retry with ai/i })[0],
      ).toBeEnabled(),
    );
  });

  it("blocks a fourth picture on a question and says why", async () => {
    const user = userEvent.setup();
    await uploadDocument(4, [
      { title: "Câu 14", imageNumbers: [1, 2, 3] },
      { title: "Câu 15" },
    ]);

    await user.selectOptions(
      screen.getByLabelText("Question for picture 4"),
      "#1 Câu 14",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 4" }));

    expect(within(questionCard("Câu 14")).getAllByRole("img")).toHaveLength(3);
    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).getByAltText("Unused picture 4")).toBeInTheDocument();
    expect(
      within(unused).getByText("A question can have at most 3 pictures."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add picture 4" }),
    ).toBeDisabled();
    // The select is what keyboard users can reach, so it carries the reason too.
    expect(
      screen.getByLabelText("Question for picture 4"),
    ).toHaveAccessibleDescription("A question can have at most 3 pictures.");
  });

  it("still adds the fourth picture to a question that has room", async () => {
    const user = userEvent.setup();
    await uploadDocument(4, [
      { title: "Câu 14", imageNumbers: [1, 2, 3] },
      { title: "Câu 15" },
    ]);

    await user.selectOptions(
      screen.getByLabelText("Question for picture 4"),
      "#2 Câu 15",
    );
    await user.click(screen.getByRole("button", { name: "Add picture 4" }));

    expect(
      within(questionCard("Câu 15")).getByRole("img", { name: "Figure 4" }),
    ).toBeInTheDocument();
  });

  it("warns on the card of a draft the AI made with more than 3 pictures, and a removed picture goes back to Unused pictures", async () => {
    const user = userEvent.setup();
    await uploadDocument(4, [
      { title: "Câu 14", imageNumbers: [1, 2, 3, 4] },
      { title: "Câu 15" },
    ]);

    expect(
      within(questionCard("Câu 14")).getByText(/at most 3 pictures/),
    ).toBeVisible();
    await user.click(
      within(questionCard("Câu 14")).getByRole("button", {
        name: "Remove picture 4",
      }),
    );

    expect(
      within(questionCard("Câu 14")).queryByText(/at most 3 pictures/),
    ).toBeNull();
    const unused = screen.getByRole("region", { name: "Unused pictures" });
    expect(within(unused).getByAltText("Unused picture 4")).toBeInTheDocument();
  });
});
