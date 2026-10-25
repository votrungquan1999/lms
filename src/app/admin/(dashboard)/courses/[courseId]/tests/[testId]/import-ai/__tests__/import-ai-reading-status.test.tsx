// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  unstable_rethrow: vi.fn(),
}));

import { parseQuestionsAction, retryQuestionAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

beforeEach(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

function makeDocxFile(name = "questions.docx"): File {
  return new File(["dummy content"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

type ParseResult = Awaited<ReturnType<typeof parseQuestionsAction>>;

const TWO_QUESTIONS: ParseResult = {
  success: true,
  message: "Extracted 2 question(s)",
  questions: [
    {
      title: "Q1",
      content: "Explain photosynthesis.",
      type: "free_text",
      imageNumbers: [1],
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
};

function renderScreen() {
  // Picture 1 belongs to Q1; picture 2 is left unused.
  vi.mocked(extractDocx).mockResolvedValue({
    text: "Some text.",
    pictures: [1, 2].map((number) => ({
      number,
      file: new File([`png-${number}`], `picture-${number}.png`, {
        type: "image/png",
      }),
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
}

/** Starts a read whose AI answer is held until the returned `finish` is called. */
function holdNextRead(): { finish: (result: ParseResult) => void } {
  let finish!: (result: ParseResult) => void;
  vi.mocked(parseQuestionsAction).mockReturnValueOnce(
    new Promise<ParseResult>((resolve) => {
      finish = resolve;
    }),
  );
  return { finish };
}

describe("Feature: AI document import — the teacher sees the AI is reading", () => {
  it("shows one status naming the file, with a spinner, while the first read runs", async () => {
    const user = userEvent.setup();
    renderScreen();
    holdNextRead();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Reading questions.docx…");
    expect(status.querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("names the new file, not the previous one, while a second file is read", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    holdNextRead();

    await user.upload(
      screen.getByLabelText(/document/i),
      makeDocxFile("second.docx"),
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Reading second.docx…");
    expect(status).toHaveTextContent(
      "The list below is from your previous file.",
    );
  });

  it("removes the status once the read succeeds", async () => {
    const user = userEvent.setup();
    renderScreen();
    const read = holdNextRead();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByRole("status");
    read.finish(TWO_QUESTIONS);

    expect(await screen.findByText("Q1")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("dims and locks the old list, including an open edit form, while a second file is read", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    await user.selectOptions(
      screen.getByLabelText("Question for picture 2"),
      screen.getByRole("option", { name: /Q2/ }),
    );
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.type(screen.getByLabelText("Title"), " (corrected)");
    holdNextRead();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "The list below is from your previous file.",
    );
    expect(screen.getByText("Q1").closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    // Q2's form is open, so Q1's Edit is the only one left on a card.
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
    for (const retry of screen.getAllByRole("button", {
      name: "Retry with AI",
    })) {
      expect(retry).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "Remove picture 1" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add picture 2" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByLabelText("Title")).toHaveValue("Q2 (corrected)");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("locks the Add and Replace choice while a second file is read, and frees it when the read ends", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    const read = holdNextRead();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    await screen.findByRole("status");
    expect(screen.getByRole("radio", { name: /^Add to/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^Replace/ })).toBeDisabled();

    read.finish(TWO_QUESTIONS);
    await screen.findAllByText("Q1");
    expect(screen.getByRole("radio", { name: /^Replace/ })).toBeEnabled();
  });

  it("dims the Student view list too while a second file is read", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    await user.click(screen.getByRole("button", { name: "Student view" }));
    holdNextRead();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    await screen.findByRole("status");
    const busy = screen
      .getByRole("region", { name: "Student view" })
      .closest("[aria-busy]");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveClass("opacity-50");
  });

  it("shows no reading status while one question is retried", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    vi.mocked(retryQuestionAction).mockReturnValueOnce(new Promise(() => {}));

    await user.click(
      screen.getAllByRole("button", { name: "Retry with AI" })[0],
    );
    await user.type(screen.getByLabelText(/what was wrong/i), "Wrong.");
    await user.click(screen.getByRole("button", { name: /^retry$/i }));

    expect(
      await screen.findByRole("button", { name: "Retrying…" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
