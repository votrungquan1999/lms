// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";
import { questionCard } from "./review-card.helpers";

afterEach(() => {
  vi.resetAllMocks();
});

/**
 * Renders the import page and uploads a document whose AI result is the given drafts.
 * @param drafts - The drafts the AI returns, in order.
 */
async function uploadDocument(
  user: ReturnType<typeof userEvent.setup>,
  drafts: ParsedQuestion[],
): Promise<void> {
  vi.mocked(extractDocx).mockResolvedValue({ text: "doc", pictures: [] });
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
    new File(["dummy"], "questions.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  await screen.findByText(drafts[0].title);
}

const FREE_TEXT: ParsedQuestion = {
  title: "Photosynthesis",
  content: "Explain photosynthesis.",
  type: "free_text",
  referenceAnswer: "Light becomes sugar.",
  explanation: "Plants store the energy.",
};

const MULTIPLE_CHOICE: ParsedQuestion = {
  title: "Prime",
  content: "Pick the prime number.",
  type: "single_select",
  options: [
    { text: "4", isCorrect: false },
    { text: "7", isCorrect: true },
  ],
  explanation: "Seven has no divisors.",
};

describe("Feature: AI document import — a card shows the model answer and explanation", () => {
  it("shows a free-text card's model answer and explanation under their labels", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [FREE_TEXT]);

    const card = within(questionCard("Photosynthesis"));

    expect(card.getByText("Model answer")).toBeInTheDocument();
    expect(card.getByText("Light becomes sugar.")).toBeInTheDocument();
    expect(card.getByText("Explanation")).toBeInTheDocument();
    expect(card.getByText("Plants store the energy.")).toBeInTheDocument();
  });

  it("shows a multiple-choice card's explanation but never a model answer", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [
      { ...MULTIPLE_CHOICE, referenceAnswer: "Should not appear." },
    ]);

    const card = within(questionCard("Prime"));

    expect(card.getByText("Explanation")).toBeInTheDocument();
    expect(card.getByText("Seven has no divisors.")).toBeInTheDocument();
    expect(card.queryByText("Model answer")).toBeNull();
    expect(card.queryByText("Should not appear.")).toBeNull();
  });

  it("shows no labels on a card whose model answer and explanation are missing, empty or only spaces", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [
      { ...FREE_TEXT, referenceAnswer: "  \n ", explanation: undefined },
      { ...MULTIPLE_CHOICE, explanation: "   " },
    ]);

    expect(screen.queryByText("Model answer")).toBeNull();
    expect(screen.queryByText("Explanation")).toBeNull();
  });

  it("lets the teacher write a multiple-choice explanation in the edit form and shows it on the saved card", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [
      { ...MULTIPLE_CHOICE, explanation: undefined },
    ]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    await user.type(
      screen.getByLabelText(/explanation/i),
      "Seven has no divisors.",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    const card = within(questionCard("Prime"));
    expect(card.getByText("Explanation")).toBeInTheDocument();
    expect(card.getByText("Seven has no divisors.")).toBeInTheDocument();
  });

  it("saves an explanation of only spaces as no explanation, so the card hides it and import sends none", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));
    await uploadDocument(user, [MULTIPLE_CHOICE]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const explanation = screen.getByLabelText(/explanation/i);
    await user.clear(explanation);
    await user.type(explanation, "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(within(questionCard("Prime")).queryByText("Explanation")).toBeNull();
    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts[0].explanation).toBeUndefined();
  });

  it("saves a model answer of only spaces as no model answer, so import sends none", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));
    await uploadDocument(user, [FREE_TEXT]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const modelAnswer = screen.getByLabelText(/model answer/i);
    await user.clear(modelAnswer);
    await user.type(modelAnswer, "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts[0].referenceAnswer).toBeUndefined();
  });

  it("imports the multiple-choice explanation the teacher edited", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));
    await uploadDocument(user, [MULTIPLE_CHOICE]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const explanation = screen.getByLabelText(/explanation/i);
    await user.clear(explanation);
    await user.type(explanation, "Only 1 and 7 divide seven.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts[0].explanation).toBe("Only 1 and 7 divide seven.");
  });
});

describe("Feature: AI document import — a multiple-choice card warns when its answer key is incomplete", () => {
  const NONE_CORRECT = [
    { text: "4", isCorrect: false },
    { text: "7", isCorrect: false },
  ];

  it("shows 'No correct answer marked' on a single-select card with no correct choice, as a plain badge", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ ...MULTIPLE_CHOICE, options: NONE_CORRECT }]);

    const card = within(questionCard("Prime"));

    expect(card.getByText("No correct answer marked")).toBeInTheDocument();
    expect(card.queryByRole("alert")).toBeNull();
  });

  it("shows only 'Needs at least 2 choices' on a card with a single choice, even when none is correct", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [
      { ...MULTIPLE_CHOICE, options: [{ text: "7", isCorrect: false }] },
    ]);

    const card = within(questionCard("Prime"));

    expect(card.getByText("Needs at least 2 choices")).toBeInTheDocument();
    expect(card.queryByText("No correct answer marked")).toBeNull();
  });

  it("shows no warning on a card with a correct choice", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [MULTIPLE_CHOICE]);

    const card = within(questionCard("Prime"));

    expect(card.queryByText("No correct answer marked")).toBeNull();
    expect(card.queryByText("Needs at least 2 choices")).toBeNull();
  });

  it("shows 'No correct answer marked' on a multi-select card with no correct choice", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [
      { ...MULTIPLE_CHOICE, type: "multi_select", options: NONE_CORRECT },
    ]);

    expect(
      within(questionCard("Prime")).getByText("No correct answer marked"),
    ).toBeInTheDocument();
  });

  it("shows 'Needs at least 2 choices' on a card the AI returned without any choices", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [{ ...MULTIPLE_CHOICE, options: undefined }]);

    const card = within(questionCard("Prime"));

    expect(card.getByText("Needs at least 2 choices")).toBeInTheDocument();
    expect(card.queryByText("No correct answer marked")).toBeNull();
  });

  it("shows no warning on a free-text card", async () => {
    const user = userEvent.setup();
    await uploadDocument(user, [FREE_TEXT]);

    const card = within(questionCard("Photosynthesis"));

    expect(card.queryByText("No correct answer marked")).toBeNull();
    expect(card.queryByText("Needs at least 2 choices")).toBeNull();
  });

  it("warns after the teacher removes the only correct choice and saves, and import still sends the question", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));
    await uploadDocument(user, [
      {
        ...MULTIPLE_CHOICE,
        options: [
          { text: "4", isCorrect: false },
          { text: "7", isCorrect: true },
          { text: "9", isCorrect: false },
        ],
      },
    ]);
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: "Remove choice 2" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      within(questionCard("Prime")).getByText("No correct answer marked"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts).toHaveLength(1);
  });
});
