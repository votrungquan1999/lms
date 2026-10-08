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

/**
 * Renders the import page and uploads a document whose AI result gives the
 * first question picture 1 and the second question none.
 */
async function uploadDocumentWithPictures(): Promise<void> {
  const user = userEvent.setup();
  vi.mocked(extractDocx).mockResolvedValue({
    text: "[image 1]Câu 14: Quan sát hình bên.\n\nCâu 15: Virus là",
    pictures: [{ number: 1, file: makePicture(1) }],
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: "Extracted 2 question(s)",
    questions: [
      {
        title: "Câu 14",
        content: "Quan sát hình bên.",
        type: "free_text",
        imageNumbers: [1],
      },
      { title: "Câu 15", content: "Virus là", type: "free_text" },
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
  await screen.findByText("Câu 14");
}

/**
 * Finds one question's review card by its title.
 * @param title - The question's title.
 * @returns The card element.
 */
function questionCard(title: string): HTMLElement {
  return screen.getByText(title).closest('[data-slot="card"]') as HTMLElement;
}

describe("Feature: AI document import — the document's pictures come along with their questions", () => {
  it("shows each question's pictures on its review card, so the teacher can check the AI matched them", async () => {
    await uploadDocumentWithPictures();

    const picture = within(questionCard("Câu 14")).getByRole("img", {
      name: "Figure 1",
    });
    expect(picture).toHaveAttribute("src", "blob:picture-1.png");
    expect(within(questionCard("Câu 15")).queryByRole("img")).toBeNull();
  });

  it("lets the teacher remove a picture the AI matched wrongly", async () => {
    const user = userEvent.setup();
    await uploadDocumentWithPictures();

    await user.click(
      within(questionCard("Câu 14")).getByRole("button", {
        name: "Remove picture 1",
      }),
    );

    expect(within(questionCard("Câu 14")).queryByRole("img")).toBeNull();
  });

  it("uploads each question's pictures on import and saves them with that question", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 2 question(s)",
      importedCount: 2,
    });
    await uploadDocumentWithPictures();

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestUploadSlotsAction).toHaveBeenCalledTimes(1);
    expect(requestUploadSlotsAction).toHaveBeenCalledWith([
      { fileName: "picture-1.png", contentType: "image/png", size: 5 },
    ]);
    expect(fetch).toHaveBeenCalledWith("https://fake-s3.local/put/k1", {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: expect.objectContaining({ name: "picture-1.png" }),
    });
    expect(importAiQuestionsAction).toHaveBeenCalledWith(
      "test-1",
      "course-1",
      [
        expect.objectContaining({
          title: "Câu 14",
          media: [
            {
              fileName: "picture-1.png",
              contentType: "image/png",
              size: 5,
              key: "media/questions/k1.png",
              order: 0,
            },
          ],
        }),
        expect.objectContaining({ title: "Câu 15", media: [] }),
      ],
      "append",
    );
  });

  it("shows a failed picture upload on that question's card and imports nothing", async () => {
    const user = userEvent.setup();
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: false,
      message: "Each media file must be 10 MB or smaller",
    });
    await uploadDocumentWithPictures();

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    expect(
      await within(questionCard("Câu 14")).findByRole("alert"),
    ).toHaveTextContent(
      "This question's pictures could not be uploaded: Each media file must be 10 MB or smaller",
    );
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeEnabled();
  });

  it("takes the pictures from the AI's re-read when the teacher retries a question", async () => {
    const user = userEvent.setup();
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Câu 15",
        content: "Virus là",
        type: "free_text",
        imageNumbers: [1],
      },
    });
    await uploadDocumentWithPictures();

    await user.click(
      within(questionCard("Câu 15")).getByRole("button", {
        name: "Retry with AI",
      }),
    );
    await user.type(
      screen.getByLabelText("What was wrong?"),
      "The virus picture belongs here",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await within(questionCard("Câu 15")).findByRole("img", {
        name: "Figure 1",
      }),
    ).toBeInTheDocument();
  });

  it("frees the picture previews once the questions are imported", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    vi.mocked(requestUploadSlotsAction).mockResolvedValue({
      success: true,
      message: "Upload slots created",
      slots: [
        {
          key: "media/questions/k1.png",
          url: "https://fake-s3.local/put/k1",
          contentType: "image/png",
          order: 0,
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 2 question(s)",
      importedCount: 2,
    });
    await uploadDocumentWithPictures();

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picture-1.png"),
    );
  });

  it("frees the previous document's picture previews once another document's questions replace them", async () => {
    const user = userEvent.setup();
    await uploadDocumentWithPictures();
    vi.mocked(extractDocx).mockResolvedValue({
      text: "Câu 1: Virus là",
      pictures: [],
    });
    let finishParse: () => void = () => {};
    vi.mocked(parseQuestionsAction).mockReturnValue(
      new Promise((resolve) => {
        finishParse = () =>
          resolve({
            success: true,
            message: "Extracted 1 question(s)",
            questions: [
              { title: "Câu 1", content: "Virus là", type: "free_text" },
            ],
          });
      }),
    );

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "another-exam.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    // The old cards stay on screen while the AI reads, so their pictures must still load.
    await waitFor(() => expect(parseQuestionsAction).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    finishParse();

    await waitFor(() =>
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picture-1.png"),
    );
  });
});
