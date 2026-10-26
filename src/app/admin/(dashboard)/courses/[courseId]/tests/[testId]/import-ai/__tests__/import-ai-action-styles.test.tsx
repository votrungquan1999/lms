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
import { questionCard } from "./review-card.helpers";

beforeEach(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("Feature: AI document import — action buttons look like what they do", () => {
  it("styles Retry with AI as a secondary action, Remove picture as a danger action, and leaves Delete as it was", async () => {
    const user = userEvent.setup();
    vi.mocked(extractDocx).mockResolvedValue({
      text: "[image 1]Look.",
      pictures: [
        {
          number: 1,
          file: new File(["png"], "picture-1.png", { type: "image/png" }),
        },
      ],
    });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Q1", content: "Look.", type: "free_text", imageNumbers: [1] },
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
    await screen.findByText("Q1");

    const card = within(questionCard("Q1"));

    expect(card.getByRole("button", { name: "Retry with AI" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(
      card.getByRole("button", { name: "Remove picture 1" }),
    ).toHaveAttribute("data-variant", "destructive");
    expect(
      card.getByRole("button", { name: "Delete question 1" }),
    ).toHaveAttribute("data-variant", "outline");
  });
});
