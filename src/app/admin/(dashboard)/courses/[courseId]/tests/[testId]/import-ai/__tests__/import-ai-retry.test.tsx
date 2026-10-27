// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
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

import {
  parseQuestionsAction,
  type RetryQuestionState,
  retryQuestionAction,
} from "../actions";
import { extractDocx } from "../document-extract";
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
  vi.mocked(extractDocx).mockResolvedValue({
    text: "1. Explain photosynthesis.\n2. Pick the prime number.",
    pictures: [],
  });
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
      <QuestionPreviewList
        testId="test-1"
        courseId="course-1"
        existingQuestionCount={0}
        answeredStudentCount={0}
      />
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

    // Hand-edit Q1 first so it is "edited".
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
    vi.mocked(extractDocx).mockResolvedValue({
      text: "1. Explain photosynthesis.\n2. Name a prime number.",
      pictures: [],
    });
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
        <QuestionPreviewList
          testId="test-1"
          courseId="course-1"
          existingQuestionCount={0}
          answeredStudentCount={0}
        />
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

    // Hand-edit Q1's title first so its edit must survive.
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

  /** Starts a retry of the first question whose AI answer the test resolves later. */
  async function startPendingRetry(user: ReturnType<typeof userEvent.setup>) {
    await uploadTwoQuestions(user);
    let resolveRetry: (state: RetryQuestionState) => void = () => {};
    vi.mocked(retryQuestionAction).mockReturnValue(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    await user.click(
      screen.getAllByRole("button", { name: /retry with ai/i })[0],
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    return resolveRetry;
  }

  const LATE_ANSWER: RetryQuestionState = {
    success: true,
    message: "Question re-read",
    question: {
      title: "Q1",
      content: "A late answer that must not appear.",
      type: "free_text",
    },
  };

  it("keeps Import disabled while a retry is running, then enables it when the answer arrives", async () => {
    const user = userEvent.setup();
    const resolveRetry = await startPendingRetry(user);

    // While the AI is still reading the question
    expect(
      screen.getByRole("button", {
        name: /import questions/i,
        hidden: true,
      }),
    ).toBeDisabled();

    // Once it answers
    resolveRetry({
      success: true,
      message: "Question re-read",
      question: { title: "Q1", content: "Re-read.", type: "free_text" },
    });
    expect(await screen.findByText("Re-read.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /import questions/i,
        hidden: true,
      }),
    ).toBeEnabled();
  });

  it("lets the teacher cancel a running retry: Import unlocks at once and the late answer changes nothing", async () => {
    const user = userEvent.setup();
    const resolveRetry = await startPendingRetry(user);

    await user.click(screen.getByRole("button", { name: /cancel retry/i }));

    expect(
      screen.getByRole("button", {
        name: /import questions/i,
        hidden: true,
      }),
    ).toBeEnabled();

    // The AI answers after the cancel
    resolveRetry(LATE_ANSWER);
    await waitFor(() => expect(retryQuestionAction).toHaveBeenCalledTimes(1));
    await new Promise((done) => setTimeout(done, 0));
    expect(
      screen.queryByText("A late answer that must not appear."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Explain photosynthesis.")).toBeInTheDocument();
  });

  it("treats closing the dialog while a retry runs as a cancel", async () => {
    const user = userEvent.setup();
    const resolveRetry = await startPendingRetry(user);

    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("button", {
        name: /import questions/i,
        hidden: true,
      }),
    ).toBeEnabled();
    resolveRetry(LATE_ANSWER);
    await new Promise((done) => setTimeout(done, 0));
    expect(
      screen.queryByText("A late answer that must not appear."),
    ).not.toBeInTheDocument();
  });

  it("shows the try-again-in-a-few-minutes message on the card and unlocks Import when the retry call is dropped", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);
    vi.mocked(retryQuestionAction).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    await user.click(
      screen.getAllByRole("button", { name: /retry with ai/i })[0],
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/few minutes/i);
    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeEnabled();
    expect(screen.getByText("Explain photosynthesis.")).toBeInTheDocument();
  });

  it("stays silent when a retry the teacher cancelled later fails", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);
    let dropConnection: (error: Error) => void = () => {};
    vi.mocked(retryQuestionAction).mockReturnValue(
      new Promise((_resolve, reject) => {
        dropConnection = reject;
      }),
    );
    await user.click(
      screen.getAllByRole("button", { name: /retry with ai/i })[0],
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong focus.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    await user.click(screen.getByRole("button", { name: /cancel retry/i }));

    dropConnection(new TypeError("Failed to fetch"));
    await new Promise((done) => setTimeout(done, 0));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
