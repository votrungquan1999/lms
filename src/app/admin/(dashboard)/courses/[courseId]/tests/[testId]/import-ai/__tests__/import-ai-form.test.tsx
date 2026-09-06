// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractTextFromDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({ parseQuestionsAction: vi.fn() }));

import { parseQuestionsAction } from "../actions";
import { extractTextFromDocx, extractTextFromPdf } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

afterEach(() => {
  vi.clearAllMocks();
});

function makeDocxFile(): File {
  return new File(["dummy content"], "questions.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function makePdfFile(): File {
  return new File(["dummy content"], "questions.pdf", {
    type: "application/pdf",
  });
}

describe("Feature: AI document import — a teacher uploads a Word document of questions for review", () => {
  it("lists each parsed question, identifying free-text and multiple-choice questions", async () => {
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
        <QuestionPreviewList />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    expect(await screen.findByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText(/free response/i)).toBeInTheDocument();
    expect(
      screen.getByText(/multiple choice \(one answer\)/i),
    ).toBeInTheDocument();
  });
});

describe("Feature: AI document import — a teacher uploads a PDF of questions for review", () => {
  it("lists each parsed question, the same as a Word document upload", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromPdf).mockResolvedValue(
      "1. Explain photosynthesis.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      ],
    });

    render(
      <ImportAiProvider>
        <ImportAiFilePicker />
        <QuestionPreviewList />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makePdfFile());

    expect(await screen.findByText("Q1")).toBeInTheDocument();
    expect(screen.getByText(/free response/i)).toBeInTheDocument();
    expect(extractTextFromPdf).toHaveBeenCalledTimes(1);
  });

  it("refuses a file larger than 10 MB and never extracts it", async () => {
    const user = userEvent.setup();
    const oversizedFile = makePdfFile();
    Object.defineProperty(oversizedFile, "size", {
      value: 10 * 1024 * 1024 + 1,
    });

    render(
      <ImportAiProvider>
        <ImportAiFilePicker />
        <QuestionPreviewList />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), oversizedFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(/10 mb/i);
    expect(extractTextFromPdf).not.toHaveBeenCalled();
    expect(parseQuestionsAction).not.toHaveBeenCalled();
  });
});
