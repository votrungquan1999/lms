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

async function uploadTwoQuestions(user: ReturnType<typeof userEvent.setup>) {
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
}

describe("Feature: AI document import — a teacher re-asks the AI about one question", () => {
  it("updates only the retried question, leaving the rest of the review list untouched", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);

    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q1",
        content: "Explain photosynthesis, focusing on the light reactions.",
        type: "free_text",
      },
    });

    const retryButtons = screen.getAllByRole("button", {
      name: /retry with ai/i,
    });
    await user.click(retryButtons[0]);

    await user.type(
      screen.getByLabelText(/what was wrong/i),
      "This should focus on the light-dependent reactions.",
    );
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(
      await screen.findByText(
        "Explain photosynthesis, focusing on the light reactions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("Pick the prime number.")).toBeInTheDocument();
  });

  it("warns before a retry discards a hand-edited question, and does not retry until confirmed", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);

    // Hand-edit Q1 first (Step 15's flow) so it is "edited".
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Explain photosynthesis in detail");
    await user.click(screen.getByRole("button", { name: /save/i }));

    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q1",
        content: "Explain photosynthesis, focusing on the light reactions.",
        type: "free_text",
      },
    });

    const retryButtons = screen.getAllByRole("button", {
      name: /retry with ai/i,
    });
    await user.click(retryButtons[0]);
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");

    // The real "Retry" submit is withheld behind a warning until confirmed.
    expect(
      screen.queryByRole("button", { name: /^retry$/i }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/hand-edited/i);
    expect(retryQuestionAction).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /discard my edit and retry/i }),
    );
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(retryQuestionAction).toHaveBeenCalledTimes(1);
  });

  it("clears a stale options array when a retry response omits it (e.g. a type correction to free_text)", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromDocx).mockResolvedValue(
      "1. Explain photosynthesis.\n2. Name a prime number.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 2 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
        {
          title: "Q2",
          content: "Pick the prime numbers.",
          type: "multi_select",
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

    // The AI corrects Q2's type to free_text — its response has no `options`
    // key at all, the shape a `return parsed.question` refactor would produce.
    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: true,
      message: "Question re-read",
      question: {
        title: "Q2",
        content: "Name a prime number.",
        type: "free_text",
      },
    });

    const retryButtons = screen.getAllByRole("button", {
      name: /retry with ai/i,
    });
    await user.click(retryButtons[1]);
    await user.type(
      screen.getByLabelText(/what was wrong/i),
      "This is free text, not multi-select.",
    );
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(await screen.findByText("Name a prime number.")).toBeInTheDocument();
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("keeps a hand-edited title on screen and shows the error when a retry fails", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);

    // Hand-edit Q1's title first (Step 15's flow) so its edit must survive.
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    const titleInput = screen.getByLabelText(/title/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Hand-edited title survives a failed retry");
    await user.click(screen.getByRole("button", { name: /save/i }));

    vi.mocked(retryQuestionAction).mockResolvedValue({
      success: false,
      message: "AI retry failed. Please try again.",
    });

    const retryButtons = screen.getAllByRole("button", {
      name: /retry with ai/i,
    });
    await user.click(retryButtons[0]);
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");

    // Q1 is hand-edited, so the discard gate must be confirmed first.
    await user.click(
      screen.getByRole("button", { name: /discard my edit and retry/i }),
    );
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(
      await screen.findByText("Hand-edited title survives a failed retry"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI retry failed. Please try again.",
    );
  });
});
