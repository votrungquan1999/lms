// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
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

import { parseQuestionsAction } from "../actions";
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
  await screen.findByText(drafts[0].title);
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
});
