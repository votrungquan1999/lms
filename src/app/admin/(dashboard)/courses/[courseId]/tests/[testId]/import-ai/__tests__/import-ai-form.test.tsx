// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractTextFromDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  // `with-span` calls this on every thrown server-action error — without it
  // a real failure surfaces as a confusing missing-export error instead of
  // its own message (J13). Defensive here since `../actions` is fully
  // mocked, but this file exercises `useRouter` from the same module.
  unstable_rethrow: vi.fn(),
}));

import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractTextFromDocx, extractTextFromPdf } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

afterEach(() => {
  // resetAllMocks (not clearAllMocks) — also clears a prior test's
  // mockResolvedValue, so an unmocked call surfaces as a real failure
  // instead of silently reusing an earlier test's canned result.
  vi.resetAllMocks();
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
        <QuestionPreviewList
          testId="test-1"
          courseId="course-1"
          existingQuestionCount={0}
          answeredStudentCount={0}
        />
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
        <QuestionPreviewList
          testId="test-1"
          courseId="course-1"
          existingQuestionCount={0}
          answeredStudentCount={0}
        />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), oversizedFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(/10 mb/i);
    expect(extractTextFromPdf).not.toHaveBeenCalled();
    expect(parseQuestionsAction).not.toHaveBeenCalled();
  });
});

describe("Feature: AI document import — a document with no readable text is refused before anything is sent", () => {
  it("shows a clear message and never calls the parse action when extraction yields no text", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromPdf).mockResolvedValue("   ");

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

    await user.upload(screen.getByLabelText(/document/i), makePdfFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no text could be read/i,
    );
    expect(parseQuestionsAction).not.toHaveBeenCalled();
  });
});

describe("Feature: AI document import — a teacher imports the reviewed questions onto the test", () => {
  it("writes the reviewed questions onto the test and returns to the test's admin page", async () => {
    const user = userEvent.setup();
    vi.mocked(extractTextFromDocx).mockResolvedValue(
      "1. Explain photosynthesis.",
    );
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 1 question(s)",
      importedCount: 1,
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

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    expect(importAiQuestionsAction).toHaveBeenCalledWith(
      "test-1",
      "course-1",
      expect.arrayContaining([
        expect.objectContaining({ title: "Q1", type: "free_text" }),
      ]),
      "append",
    );
    expect(push).toHaveBeenCalledWith("/admin/courses/course-1/tests/test-1");
  });

  it("routes a named rejection onto the offending question's card, not a page-level banner", async () => {
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
            { text: "4", isCorrect: true },
            { text: "7", isCorrect: true },
          ],
        },
      ],
    });
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: false,
      message: 'Question 2 ("Q2"): Exactly one option must be marked correct.',
      invalidQuestionIndex: 1,
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
    expect(screen.getByText("Q2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /import questions/i }));

    // Exactly one alert on the page, and it lives inside Q2's own card —
    // not a bare page-level banner and not on Q1's card.
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    const q2Card = screen.getByText("Q2").closest('[data-slot="card"]');
    expect(q2Card).not.toBeNull();
    expect(within(q2Card as HTMLElement).getByRole("alert")).toHaveTextContent(
      /question 2/i,
    );
  });
});
