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
  importAiQuestionsAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  // `with-span` calls this on every thrown server-action error (J13);
  // `../actions` is fully mocked here, but the review list now always
  // renders `ImportQuestionsButton`, which calls `useRouter`.
  unstable_rethrow: vi.fn(),
}));

import { draftQuestionSchema } from "src/lib/ai/question-import-schema";
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
    vi.mocked(extractDocx).mockResolvedValue({
      text: "1. Explain photosynthesis.\n2. Pick the prime number.",
      pictures: [],
    });
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

    // Deleting an AI-invented model answer is how the teacher removes it.
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
    expect(draftQuestionSchema.safeParse(savedDraft).success).toBe(true);
  });

  it("scopes edit-field ids per question, so two open editors don't share a label target", async () => {
    const user = userEvent.setup();
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

describe("Feature: AI document import — Import waits until every open edit is saved or cancelled", () => {
  const OPEN_EDITS_NOTE = "Save or cancel your open edits first";

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
        { title: "Q2", content: "Pick the prime number.", type: "free_text" },
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

  it("disables Import with a note while a question's edit form is open", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);
    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeEnabled();

    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeDisabled();
    expect(screen.getByText(OPEN_EDITS_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["Save", "Cancel"])(
    "enables Import again once the open edit is closed with %s",
    async (closeWith) => {
      const user = userEvent.setup();
      await uploadTwoQuestions(user);
      await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

      await user.click(screen.getByRole("button", { name: closeWith }));

      expect(
        screen.getByRole("button", { name: /import questions/i }),
      ).toBeEnabled();
      expect(screen.queryByText(OPEN_EDITS_NOTE)).not.toBeInTheDocument();
    },
  );

  it("keeps Import disabled while any one of two open edit forms remains open", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);
    await user.click(screen.getAllByRole("button", { name: /^edit$/i })[0]);

    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]);

    expect(
      screen.getByRole("button", { name: /import questions/i }),
    ).toBeDisabled();
    expect(screen.getByText(OPEN_EDITS_NOTE)).toBeInTheDocument();
  });

  it("keeps Edit disabled while the import is running", async () => {
    const user = userEvent.setup();
    await uploadTwoQuestions(user);
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    expect(await screen.findByText("Importing…")).toBeInTheDocument();
    for (const edit of screen.getAllByRole("button", { name: /^edit$/i })) {
      expect(edit).toBeDisabled();
    }
  });
});

describe("Feature: AI document import — a teacher adds and removes choices while editing a multiple-choice draft", () => {
  /**
   * Reviews one multiple-choice draft and opens its edit form.
   * @param options - The draft's choices; omit for a draft that came back without any.
   */
  async function editChoiceQuestion(
    user: ReturnType<typeof userEvent.setup>,
    options?: { text: string; isCorrect: boolean }[],
  ): Promise<void> {
    vi.mocked(extractDocx).mockResolvedValue({ text: "doc", pictures: [] });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        {
          title: "Q1",
          content: "Pick the prime number.",
          type: "single_select",
          options,
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
    await screen.findByText("Q1");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
  }

  const TWO_CHOICES = [
    { text: "4", isCorrect: false },
    { text: "7", isCorrect: true },
  ];

  it("adds a blank choice row each time Add option is pressed", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, TWO_CHOICES);

    await user.click(screen.getByRole("button", { name: "Add option" }));

    expect(screen.getAllByLabelText(/option \d+ text/i)).toHaveLength(3);
    expect(screen.getByLabelText("Option 3 text")).toHaveValue("");
  });

  it("disables Remove on every row while the draft has only 2 choices, and enables it once a third is added", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, TWO_CHOICES);

    expect(
      screen.getByRole("button", { name: "Remove choice 1" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove choice 2" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Add option" }));

    expect(
      screen.getByRole("button", { name: "Remove choice 1" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Remove choice 3" }),
    ).toBeEnabled();
  });

  it("removes the chosen row and renumbers the rows after it", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, [
      { text: "4", isCorrect: false },
      { text: "7", isCorrect: true },
      { text: "9", isCorrect: false },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove choice 2" }));

    expect(screen.getAllByLabelText(/option \d+ text/i)).toHaveLength(2);
    expect(screen.getByLabelText("Option 1 text")).toHaveValue("4");
    expect(screen.getByLabelText("Option 2 text")).toHaveValue("9");
  });

  it("moves focus to Add option after a choice is removed", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, [
      ...TWO_CHOICES,
      { text: "9", isCorrect: false },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove choice 2" }));

    expect(screen.getByRole("button", { name: "Add option" })).toHaveFocus();
  });

  it("lets the teacher remove the only correct choice, and the saved card then shows no tick", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, [
      { text: "4", isCorrect: false },
      { text: "7", isCorrect: true },
      { text: "9", isCorrect: false },
    ]);

    await user.click(screen.getByRole("button", { name: "Remove choice 2" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const choices = screen.getAllByRole("listitem");
    expect(choices.map((choice) => choice.textContent)).toEqual(["○4", "○9"]);
  });

  it("opens a draft that came back with no choices with no rows and an Add option button that starts the list", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user);

    expect(screen.queryAllByLabelText(/option \d+ text/i)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Add option" }));

    expect(screen.getAllByLabelText(/option \d+ text/i)).toHaveLength(1);
  });

  it("types into two blank rows independently", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, TWO_CHOICES);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.click(screen.getByRole("button", { name: "Add option" }));

    await user.type(screen.getByLabelText("Option 3 text"), "Alpha");
    await user.type(screen.getByLabelText("Option 4 text"), "Beta");

    expect(screen.getByLabelText("Option 3 text")).toHaveValue("Alpha");
    expect(screen.getByLabelText("Option 4 text")).toHaveValue("Beta");
  });

  it("saves a blank choice as typed and sends it to the import unchanged", async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockReturnValue(new Promise(() => {}));
    await editChoiceQuestion(user, TWO_CHOICES);
    await user.click(screen.getByRole("button", { name: "Add option" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    await waitFor(() => expect(importAiQuestionsAction).toHaveBeenCalled());
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts[0].options?.[2]).toEqual({ text: "", isCorrect: false });
  });

  it("records adding and removing choices as one edit that a single Undo reverts", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, TWO_CHOICES);
    await user.click(screen.getByRole("button", { name: "Add option" }));
    await user.type(screen.getByLabelText("Option 3 text"), "11");
    await user.click(screen.getByRole("button", { name: "Remove choice 1" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getAllByRole("listitem").map((choice) => choice.textContent),
    ).toEqual(["✓7", "○11"]);

    await user.click(
      screen.getByRole("button", { name: "Undo edit of Question 1" }),
    );

    expect(
      screen.getAllByRole("listitem").map((choice) => choice.textContent),
    ).toEqual(["○4", "✓7"]);
  });

  it("keeps Remove disabled on a draft that came back with a single choice", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, [{ text: "4", isCorrect: true }]);

    expect(
      screen.getByRole("button", { name: "Remove choice 1" }),
    ).toBeDisabled();
  });

  it("lists two choices with the same text as two separate rows, without a duplicate-key warning", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await editChoiceQuestion(user, [
      { text: "Yes", isCorrect: false },
      { text: "Yes", isCorrect: true },
    ]);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getAllByRole("listitem").map((choice) => choice.textContent),
    ).toEqual(["○Yes", "✓Yes"]);
    const warnings = consoleError.mock.calls.map((args) => String(args[0]));
    expect(warnings.filter((text) => text.includes("same key"))).toEqual([]);
    consoleError.mockRestore();
  });

  it("makes a clicked radio the only correct choice even when it is already checked", async () => {
    const user = userEvent.setup();
    await editChoiceQuestion(user, [
      { text: "A", isCorrect: true },
      { text: "B", isCorrect: true },
    ]);

    await user.click(screen.getByLabelText("Mark option 1 correct"));

    expect(screen.getByLabelText("Mark option 1 correct")).toBeChecked();
    expect(screen.getByLabelText("Mark option 2 correct")).not.toBeChecked();
  });
});
