// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { questionCard } from "./review-card.helpers";

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

/** One AI-made draft in the shape the parse action returns. */
interface DraftSpec {
  title: string;
  imageNumbers?: number[];
}

/**
 * Renders the import page and uploads a document whose AI result is the given drafts.
 * @param pictureCount - How many pictures the document holds, numbered from 1.
 * @param drafts - The drafts the AI returns, in order.
 */
async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
  pictureCount: number,
  drafts: DraftSpec[],
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
 * Grants a slot for every requested file, keyed by its file name, except
 * for the file names listed as refused.
 * @param refused - File names whose slot request fails.
 */
function grantSlots(refused: string[] = []): void {
  vi.mocked(requestUploadSlotsAction).mockImplementation(
    async (files: RequestUploadSlotsInput[]) =>
      files.some((file) => refused.includes(file.fileName))
        ? { success: false, message: "Upload slots unavailable" }
        : {
            success: true,
            message: "Upload slots created",
            slots: files.map((file, i) => ({
              key: `media/questions/${file.fileName}`,
              url: `https://fake-s3.local/put/${file.fileName}`,
              contentType: file.contentType,
              order: i,
            })),
          },
  );
}

/** Answers one held slot request: grants its slots, or refuses them. */
type SlotRelease = (outcome: "grant" | "refuse") => void;

/**
 * Holds every slot request until the test answers it, so the test controls
 * which question's upload finishes first.
 * @returns The answer function of each held request, by its first file name.
 */
function holdSlots(): Map<string, SlotRelease> {
  const held = new Map<string, SlotRelease>();
  vi.mocked(requestUploadSlotsAction).mockImplementation(
    (files: RequestUploadSlotsInput[]) =>
      new Promise((resolve) => {
        held.set(files[0].fileName, (outcome) =>
          resolve(
            outcome === "refuse"
              ? {
                  success: false,
                  message: `No slot for ${files[0].fileName}`,
                }
              : {
                  success: true,
                  message: "Upload slots created",
                  slots: files.map((file, i) => ({
                    key: `media/questions/${file.fileName}`,
                    url: `https://fake-s3.local/put/${file.fileName}`,
                    contentType: file.contentType,
                    order: i,
                  })),
                },
          ),
        );
      }),
  );
  return held;
}

/**
 * Every file name sent for an upload slot, call by call.
 * @returns The requested file names per slot request.
 */
function requestedFileNames(): string[][] {
  return vi
    .mocked(requestUploadSlotsAction)
    .mock.calls.map(([files]) => files.map((file) => file.fileName));
}

describe("Feature: AI document import — each picture uploads once per read", () => {
  it("uploads on a second Import only the pictures the first attempt did not upload", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, 2, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15", imageNumbers: [2] },
    ]);
    grantSlots(["picture-2.png"]);
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await within(questionCard("Câu 15")).findByRole("alert");

    grantSlots();
    vi.mocked(requestUploadSlotsAction).mockClear();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestedFileNames()).toEqual([["picture-2.png"]]);
    const [, , reviewed] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(reviewed.map((question) => question.media)).toEqual([
      [
        {
          fileName: "picture-1.png",
          contentType: "image/png",
          size: 5,
          key: "media/questions/picture-1.png",
          order: 0,
        },
      ],
      [
        {
          fileName: "picture-2.png",
          contentType: "image/png",
          size: 5,
          key: "media/questions/picture-2.png",
          order: 0,
        },
      ],
    ]);
  });

  it("uploads every picture again on the next Import after the server refused a picture key", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, 1, [{ title: "Câu 14", imageNumbers: [1] }]);
    grantSlots();
    // A key minted for one school is refused once the admin's active school changes in another tab.
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: 'Question 1 ("Câu 14"): Invalid media key',
      invalidQuestionIndex: 0,
      invalidQuestionReason: "Invalid media key",
    });
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await within(questionCard("Câu 14")).findByRole("alert");

    vi.mocked(requestUploadSlotsAction).mockClear();
    vi.mocked(importAiQuestionsAction).mockClear();
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestedFileNames()).toEqual([["picture-1.png"]]);
  });

  it("uploads a picture two questions share once and saves the same file with both", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, 1, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15", imageNumbers: [1] },
    ]);
    grantSlots();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestedFileNames()).toEqual([["picture-1.png"]]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, , reviewed] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(
      reviewed.map((question) => question.media?.map((entry) => entry.key)),
    ).toEqual([
      ["media/questions/picture-1.png"],
      ["media/questions/picture-1.png"],
    ]);
  });

  it("uploads the pictures again after a new file is read, since its picture 1 is a different file", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, 2, [
      { title: "Câu 14", imageNumbers: [1] },
      { title: "Câu 15", imageNumbers: [2] },
    ]);
    grantSlots(["picture-2.png"]);
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await within(questionCard("Câu 15")).findByRole("alert");

    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        {
          title: "Câu 1 mới",
          content: "Nội dung",
          type: "free_text",
          imageNumbers: [1],
        },
      ],
    });
    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["docx"], "second.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Read and replace" }));
    await screen.findByText("Câu 1 mới");
    grantSlots();
    vi.mocked(requestUploadSlotsAction).mockClear();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    expect(requestedFileNames()).toEqual([["picture-1.png"]]);
  });

  it("refuses a question with more than 3 pictures on its own card before uploading anything", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, 4, [
      { title: "Câu 14", imageNumbers: [1, 2] },
      { title: "Câu 15", imageNumbers: [1, 2, 3, 4] },
    ]);
    grantSlots();

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    expect(
      await within(questionCard("Câu 15")).findByRole("alert"),
    ).toHaveTextContent(
      "Question 2 — Its pictures could not be uploaded: A question can have at most 3 media files",
    );
    expect(requestUploadSlotsAction).not.toHaveBeenCalled();
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeEnabled();
  });
});

describe("Feature: AI document import — pictures upload several questions at a time", () => {
  it("uploads up to 4 questions' pictures at once and starts the next when one finishes", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      5,
      [1, 2, 3, 4, 5].map((n) => ({ title: `Câu ${n}`, imageNumbers: [n] })),
    );
    const held = holdSlots();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: "Unauthorized: admin access required",
    });

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() =>
      expect(requestUploadSlotsAction).toHaveBeenCalledTimes(4),
    );
    await act(async () => {});
    expect(requestedFileNames()).toEqual([
      ["picture-1.png"],
      ["picture-2.png"],
      ["picture-3.png"],
      ["picture-4.png"],
    ]);

    await act(async () => held.get("picture-2.png")?.("grant"));
    await waitFor(() =>
      expect(requestUploadSlotsAction).toHaveBeenCalledTimes(5),
    );
    for (const name of [
      "picture-1.png",
      "picture-3.png",
      "picture-4.png",
      "picture-5.png",
    ]) {
      await act(async () => held.get(name)?.("grant"));
    }

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , reviewed] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(
      reviewed.map((question) => question.media?.map((entry) => entry.key)),
    ).toEqual([1, 2, 3, 4, 5].map((n) => [`media/questions/picture-${n}.png`]));
  });

  it("shows the earliest failing question in review order, starts no more uploads, and imports nothing", async () => {
    const user = userEvent.setup();
    await uploadDocument(
      user,
      5,
      [1, 2, 3, 4, 5].map((n) => ({ title: `Câu ${n}`, imageNumbers: [n] })),
    );
    const held = holdSlots();

    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await waitFor(() =>
      expect(requestUploadSlotsAction).toHaveBeenCalledTimes(4),
    );
    // Câu 3 fails first, then Câu 1; the others succeed.
    await act(async () => held.get("picture-3.png")?.("refuse"));
    await act(async () => held.get("picture-1.png")?.("refuse"));
    await act(async () => held.get("picture-2.png")?.("grant"));
    await act(async () => held.get("picture-4.png")?.("grant"));

    expect(
      await within(questionCard("Câu 1")).findByRole("alert"),
    ).toHaveTextContent(
      "Question 1 — Its pictures could not be uploaded: No slot for picture-1.png",
    );
    expect(within(questionCard("Câu 3")).queryByRole("alert")).toBeNull();
    expect(requestedFileNames()).not.toContainEqual(["picture-5.png"]);
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
  });
});
