// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
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

function makeDocxFile(): File {
  return new File(["dummy content"], "questions.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function renderScreen() {
  return render(
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

/** True when the browser would show its "Leave site?" prompt. */
function browserWarnsOnUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("Feature: AI document import — refreshing or closing the tab with work on screen warns first", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes the browser warn while a reviewed list is on screen", async () => {
    const user = userEvent.setup();
    vi.mocked(extractDocx).mockResolvedValue({
      text: "1. Explain photosynthesis.",
      pictures: [],
    });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      ],
    });
    renderScreen();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    expect(browserWarnsOnUnload()).toBe(true);
  });

  it("makes the browser warn while the first read is still running", async () => {
    const user = userEvent.setup();
    vi.mocked(extractDocx).mockReturnValue(new Promise(() => {}));
    renderScreen();

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText(/reading questions\.docx/i)).toBeVisible();

    expect(browserWarnsOnUnload()).toBe(true);
  });

  it("does not warn on an empty screen", () => {
    renderScreen();

    expect(browserWarnsOnUnload()).toBe(false);
  });

  it("stops warning once the import has emptied the screen", async () => {
    const user = userEvent.setup();
    vi.mocked(extractDocx).mockResolvedValue({
      text: "1. Explain photosynthesis.",
      pictures: [],
    });
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
    renderScreen();
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^import/i }));

    await waitFor(() =>
      expect(importAiQuestionsAction).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(browserWarnsOnUnload()).toBe(false));
  });

  it("stops warning once the import screen is closed", async () => {
    const user = userEvent.setup();
    vi.mocked(extractDocx).mockResolvedValue({
      text: "1. Explain photosynthesis.",
      pictures: [],
    });
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [
        { title: "Q1", content: "Explain photosynthesis.", type: "free_text" },
      ],
    });
    const { unmount } = renderScreen();
    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    unmount();

    expect(browserWarnsOnUnload()).toBe(false);
  });
});
