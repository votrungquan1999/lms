// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractTextFromDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  retryQuestionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  // `with-span` calls this on every thrown server-action error (J13);
  // `../actions` is fully mocked here, but the review list now always
  // renders `ImportQuestionsButton`, which calls `useRouter`.
  unstable_rethrow: vi.fn(),
}));

import { questionImportItemSchema } from "src/lib/ai/question-import-schema";
import { parseQuestionsAction, retryQuestionAction } from "../actions";
import { extractTextFromDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

afterEach(() => {
  vi.resetAllMocks();
});

function makeDocxFile(): File {
  return new File(["dummy content"], "questions.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

describe("Feature: AI document import — a teacher corrects a reviewed question by hand", () => {
  it("updates only the edited question's title, leaving the rest of the review list untouched", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromDocx).mockResolvedValue(
      "1. Explain photosynthesis.\n2. Pick the prime number.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 2 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
        {
          title: "Q2",
          content: "Pick the prime number.",
          type: "single_select",
          options: [
            { text: "4", isCorrect: false },
            { text: "7", isCorrect: true },
          ],
        },
      ],
    });

    render(
      <ImportAiProvider>
        <ImportAiFilePicker />
        <QuestionPreviewList testId="test-1" courseId="course-1" />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    // Correct the first question's title by hand.
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    await user.click(editButtons[0]);

    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Explain the process of photosynthesis");
    await user.click(screen.getByRole("button", { name: /save/i }));

    // The edited question shows the correction; the other is untouched.
    expect(
      screen.getByText("Explain the process of photosynthesis"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Q1")).not.toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
  });

  it("saves a cleared model answer as a draft the AI-import schema still accepts", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromDocx).mockResolvedValue(
      "1. Explain photosynthesis.\n2. Pick the prime number.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 2 question(s)",
      questions: [
        {
          title: "Q1",
          content: "Explain photosynthesis.",
          type: "free_text",
          referenceAnswer: "Photosynthesis converts light to chemical energy.",
        },
        {
          title: "Q2",
          content: "Pick the prime number.",
          type: "single_select",
          options: [
            { text: "4", isCorrect: false },
            { text: "7", isCorrect: true },
          ],
        },
      ],
    });

    render(
      <ImportAiProvider>
        <ImportAiFilePicker />
        <QuestionPreviewList testId="test-1" courseId="course-1" />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    // Delete the AI-invented model answer — the D6 remedy for that defect.
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    await user.clear(screen.getByLabelText(/model answer/i));
    await user.click(screen.getByRole("button", { name: /save/i }));

    // A hand-edit requires discard confirmation before retrying — go through it
    // to get at the saved draft `retryQuestionAction` is called with.
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q1",
        content: "Explain photosynthesis.",
        type: "free_text",
      },
    });
    await user.click(
      screen.getAllByRole("button", { name: /retry with ai/i })[0],
    );
    await user.type(
      screen.getByLabelText(/what was wrong/i),
      "Add a model answer.",
    );
    await user.click(
      screen.getByRole("button", { name: /discard my edit and retry/i }),
    );
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    const [, savedDraft] = vi.mocked(retryQuestionAction).mock.calls[0];
    expect(questionImportItemSchema.safeParse(savedDraft).success).toBe(true);
  });

  it("scopes edit-field ids per question, so two open editors don't share a label target", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromDocx).mockResolvedValue(
      "1. Explain photosynthesis.\n2. Pick the prime number.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 2 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
        {
          title: "Q2",
          content: "Pick the prime number.",
          type: "single_select",
          options: [
            { text: "4", isCorrect: false },
            { text: "7", isCorrect: true },
          ],
        },
      ],
    });

    render(
      <ImportAiProvider>
        <ImportAiFilePicker />
        <QuestionPreviewList testId="test-1" courseId="course-1" />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    // Open both cards' editors at once — nothing closes the other one.
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    // Click the SECOND card's "Title" label; it must focus Q2's own input.
    const titleLabels = screen.getAllByText("Title");
    expect(titleLabels).toHaveLength(2);
    await user.click(titleLabels[1]);

    expect(document.activeElement).toHaveValue("Q2");
  });
});
