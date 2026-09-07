// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
  // `with-span` calls this on every thrown server-action error (J13);
  // `../actions` is fully mocked here, but this file exercises `useRouter`.
  unstable_rethrow: vi.fn(),
}));

import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractTextFromDocx } from "../document-extract";
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

describe("Feature: AI document import — replacing a test's questions warns and requires typed confirmation", () => {
  it('keeps Replace disabled until the teacher types "override", names the CORRECTED consequence, and sends mode: replace on confirm', async () => {
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
          existingQuestionCount={3}
          answeredStudentCount={2}
        />
      </ImportAiProvider>,
    );

    await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
    expect(await screen.findByText("Q1")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /replace/i }));
    await user.click(
      screen.getByRole("button", { name: /^replace questions$/i }),
    );
    // Opening the confirm dialog must not itself fire the import — a
    // double-fire mutant here was previously caught only incidentally.
    expect(importAiQuestionsAction).not.toHaveBeenCalled();

    // D43's CORRECTED wording — an explicitly-submitted student stays
    // Graded; only an implicitly-submitted one may drop to In Progress.
    expect(await screen.findByText(/stays graded/i)).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    // D71's "At least" qualifier and the existing-question count are
    // passed-through props — assert them so dropping either is visible.
    expect(screen.getByText(/at least 2 students/i)).toBeInTheDocument();
    expect(screen.getByText(/3 questions/i)).toBeInTheDocument();

    const confirmInput = screen.getByLabelText(/type.*override.*to confirm/i);
    const confirmButton = screen.getByRole("button", {
      name: /^yes, replace$/i,
    });
    expect(confirmButton).toBeDisabled();

    // A near-miss must not satisfy the friction gate.
    await user.type(confirmInput, "wrong");
    expect(confirmButton).toBeDisabled();

    await user.clear(confirmInput);
    expect(confirmButton).toBeDisabled();

    await user.type(confirmInput, "override");
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    expect(importAiQuestionsAction).toHaveBeenCalledWith(
      "test-1",
      "course-1",
      expect.arrayContaining([
        expect.objectContaining({ title: "Q1", type: "free_text" }),
      ]),
      "replace",
    );
    expect(push).toHaveBeenCalledWith("/admin/courses/course-1/tests/test-1");
  });
});
