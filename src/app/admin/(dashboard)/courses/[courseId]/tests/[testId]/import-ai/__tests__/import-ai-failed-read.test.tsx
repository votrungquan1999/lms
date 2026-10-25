// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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

import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
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
    { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
    { title: "Q2", content: "Name a prime.", type: "free_text" },
  ],
};

function renderScreen() {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "Some text.",
    pictures: [],
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

/** Reads a first file so a list of drafts is on screen. */
async function readFirstFile(user: ReturnType<typeof userEvent.setup>) {
  vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);
  await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
  await screen.findByText("Q1");
}

/** Picks a second readable file and confirms the replace dialog. */
async function pickSecondFileAndConfirm(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.upload(
    screen.getByLabelText(/document/i),
    makeDocxFile("week-2.docx"),
  );
  await user.click(
    await screen.findByRole("button", { name: "Read and replace" }),
  );
}

describe("Feature: AI document import — a failed read keeps the list on screen", () => {
  it("keeps the old cards with the AI's error shown above them", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "The AI is busy right now.",
    });

    await pickSecondFileAndConfirm(user);

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("The AI is busy right now.");
    const card = screen.getByText("Q1");
    expect(
      banner.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Q2")).toBeInTheDocument();
  });

  it("keeps the old pictures and their previews when the read fails", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(extractDocx).mockResolvedValueOnce({
      text: "Some text.",
      pictures: [
        {
          number: 1,
          file: new File(["png"], "picture-1.png", { type: "image/png" }),
        },
      ],
    });
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        {
          title: "Q1",
          content: "Explain photosynthesis.",
          type: "free_text",
          imageNumbers: [1],
        },
      ],
    });
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    await screen.findByText("Q1");
    const previewSrc = screen.getByRole("img").getAttribute("src");
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "The AI is busy right now.",
    });

    await pickSecondFileAndConfirm(user);

    await screen.findByRole("alert");
    expect(screen.getByRole("img")).toHaveAttribute("src", previewSrc);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("keeps the list and shows the reason when the file is the wrong type", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderScreen();
    await readFirstFile(user);

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["x"], "notes.txt", { type: "text/plain" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload a .docx or .pdf file.",
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("names the rejected file in the banner", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderScreen();
    await readFirstFile(user);

    await user.upload(
      screen.getByLabelText(/document/i),
      new File(["x"], "notes.txt", { type: "text/plain" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "notes.txt — Upload a .docx or .pdf file.",
    );
  });

  it("keeps the list and shows the reason when the file is over 10 MB", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    const big = makeDocxFile("big.docx");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });

    await user.upload(screen.getByLabelText(/document/i), big);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The file must be 10 MB or smaller.",
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the list and shows the reason when the file cannot be opened", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(extractDocx).mockRejectedValueOnce(new Error("corrupt"));

    await pickSecondFileAndConfirm(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document could not be read.",
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("keeps the list and shows the reason when the file has no text", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(extractDocx).mockResolvedValueOnce({ text: "  ", pictures: [] });

    await pickSecondFileAndConfirm(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No text could be read from this document.",
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("keeps the list and shows the reason when the AI finds no questions", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 0 question(s)",
      questions: [],
    });

    await pickSecondFileAndConfirm(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No questions were found in this document.",
    );
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("keeps the Replace choice and a hand edit when the read fails", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    await user.click(screen.getByRole("radio", { name: /replace the test/i }));
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await user.type(screen.getByLabelText("Title"), " (corrected)");
    await user.click(screen.getByRole("button", { name: "Save" }));
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "The AI is busy right now.",
    });

    await pickSecondFileAndConfirm(user);

    await screen.findByRole("alert");
    expect(screen.getByText("Q1 (corrected)")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /replace the test/i }),
    ).toBeChecked();
  });

  it("removes the reading status once the read fails", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "The AI is busy right now.",
    });

    await pickSecondFileAndConfirm(user);

    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears an earlier import failure once a new file is read", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(importAiQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "Unauthorized: admin access required",
    });
    await user.click(screen.getByRole("button", { name: /import questions/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unauthorized: admin access required",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(TWO_QUESTIONS);

    await pickSecondFileAndConfirm(user);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
