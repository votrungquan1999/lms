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

import { parseQuestionsAction } from "../actions";
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
});
