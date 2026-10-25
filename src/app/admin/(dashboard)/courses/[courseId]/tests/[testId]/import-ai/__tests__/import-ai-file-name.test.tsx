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

import { parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import { ImportAiFilePicker } from "../question-preview.ui";

beforeEach(() => {
  URL.createObjectURL = vi.fn((file: Blob) => `blob:${(file as File).name}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

function makeDocxFile(name: string): File {
  return new File(["dummy content"], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function renderPicker() {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "Some text.",
    pictures: [],
  });
  render(
    <ImportAiProvider>
      <ImportAiFilePicker />
    </ImportAiProvider>,
  );
}

describe("file picker shows the file on screen", () => {
  it("says No file chosen before any pick", () => {
    renderPicker();

    expect(screen.getByText("No file chosen")).toBeTruthy();
  });

  it("shows the last read file once its questions are on screen", async () => {
    renderPicker();
    vi.mocked(parseQuestionsAction).mockResolvedValue({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [{ title: "Q1", content: "Explain.", type: "free_text" }],
    });

    await userEvent.upload(
      screen.getByLabelText("Document (.docx or .pdf)"),
      makeDocxFile("pictures.docx"),
    );

    await waitFor(() => {
      expect(screen.getByText("pictures.docx")).toBeTruthy();
    });
    expect(screen.queryByText("No file chosen")).toBeNull();
  });

  it("keeps the last read file visible when a later read fails", async () => {
    renderPicker();
    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: true,
      message: "Extracted 1 question(s)",
      questions: [{ title: "Q1", content: "Explain.", type: "free_text" }],
    });
    const input = screen.getByLabelText("Document (.docx or .pdf)");
    await userEvent.upload(input, makeDocxFile("first.docx"));
    await waitFor(() => expect(screen.getByText("first.docx")).toBeTruthy());

    vi.mocked(parseQuestionsAction).mockResolvedValueOnce({
      success: false,
      message: "boom",
    } as never);
    await userEvent.upload(input, makeDocxFile("second.docx"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Read and replace" }),
    );

    await screen.findByRole("alert");
    expect(screen.getByText("first.docx")).toBeTruthy();
  });

  it("shows the file being read while the AI reads it", async () => {
    renderPicker();
    vi.mocked(parseQuestionsAction).mockReturnValue(new Promise(() => {}));

    await userEvent.upload(
      screen.getByLabelText("Document (.docx or .pdf)"),
      makeDocxFile("slow.docx"),
    );

    await waitFor(() => {
      expect(screen.getAllByText(/slow\.docx/).length).toBeGreaterThan(1);
    });
  });

  it("opens the native input from the Choose file button", async () => {
    renderPicker();
    const input = screen.getByLabelText("Document (.docx or .pdf)");
    const click = vi.spyOn(input as HTMLInputElement, "click");

    await userEvent.click(screen.getByRole("button", { name: "Choose file" }));

    expect(click).toHaveBeenCalled();
  });
});
