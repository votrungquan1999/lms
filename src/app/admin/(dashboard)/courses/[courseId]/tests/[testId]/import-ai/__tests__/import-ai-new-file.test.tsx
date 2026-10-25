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

import { parseQuestionsAction } from "../actions";
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

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function makeDocxFile(name = "questions.docx"): File {
  return new File(["dummy content"], name, { type: DOCX_TYPE });
}

type ParseResult = Awaited<ReturnType<typeof parseQuestionsAction>>;

function parsed(titles: string[]): ParseResult {
  return {
    success: true,
    message: `Extracted ${titles.length} question(s)`,
    questions: titles.map((title) => ({
      title,
      content: `${title} content`,
      type: "free_text" as const,
    })),
  };
}

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
  vi.mocked(parseQuestionsAction).mockResolvedValueOnce(parsed(["Q1", "Q2"]));
  await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
  await screen.findByText("Q1");
  vi.mocked(extractDocx).mockClear();
  vi.mocked(parseQuestionsAction).mockClear();
}

describe("Feature: AI document import — picking a new file over work on screen", () => {
  it("asks which file will replace the list and reads nothing until confirmed", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);

    await user.upload(
      screen.getByLabelText(/document/i),
      makeDocxFile("week-2.docx"),
    );

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("week-2.docx");
    expect(extractDocx).not.toHaveBeenCalled();
    expect(parseQuestionsAction).not.toHaveBeenCalled();
    expect(screen.getByText("Q1")).toBeInTheDocument();
  });

  it("keeps the list and reads nothing when the teacher cancels", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    await user.upload(
      screen.getByLabelText(/document/i),
      makeDocxFile("week-2.docx"),
    );
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(extractDocx).not.toHaveBeenCalled();
    expect(parseQuestionsAction).not.toHaveBeenCalled();
  });

  it("keeps the list and reads nothing when the teacher presses Escape", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    await user.upload(
      screen.getByLabelText(/document/i),
      makeDocxFile("week-2.docx"),
    );
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(parseQuestionsAction).not.toHaveBeenCalled();
    expect(extractDocx).not.toHaveBeenCalled();
  });

  it("reads the new file and replaces the list when the teacher confirms", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(parsed(["New A"]));
    await user.upload(
      screen.getByLabelText(/document/i),
      makeDocxFile("week-2.docx"),
    );
    await screen.findByRole("alertdialog");

    await user.click(screen.getByRole("button", { name: "Read and replace" }));

    expect(await screen.findByText("New A")).toBeInTheDocument();
    expect(screen.queryByText("Q1")).not.toBeInTheDocument();
    expect(parseQuestionsAction).toHaveBeenCalledTimes(1);
  });

  it("opens no dialog for the first file", async () => {
    const user = userEvent.setup();
    renderScreen();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce(parsed(["Q1"]));

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());

    expect(await screen.findByText("Q1")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks again when the same file is picked again after Cancel", async () => {
    const user = userEvent.setup();
    renderScreen();
    await readFirstFile(user);
    const again = makeDocxFile("week-2.docx");
    await user.upload(screen.getByLabelText(/document/i), again);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await user.upload(screen.getByLabelText(/document/i), again);

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "week-2.docx",
    );
  });
});
