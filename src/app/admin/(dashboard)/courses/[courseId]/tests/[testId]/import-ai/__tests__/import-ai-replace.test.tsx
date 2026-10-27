// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../document-extract", () => ({
  extractDocx: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../actions", () => ({
  parseQuestionsAction: vi.fn(),
  importAiQuestionsAction: vi.fn(),
}));
vi.mock("../../question-media-actions", () => ({
  requestUploadSlotsAction: vi.fn(),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  // `with-span` calls this on every thrown server-action error (J13);
  // `../actions` is fully mocked here, but this file exercises `useRouter`.
  unstable_rethrow: vi.fn(),
}));

import { requestUploadSlotsAction } from "../../question-media-actions";
import { importAiQuestionsAction, parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";
import { questionCard } from "./review-card.helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function makeDocxFile(): File {
  return new File(["dummy content"], "questions.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Reviews the given number of questions in Replace mode and opens the confirmation.
 * @param counts - What the page knows about the test: its questions and answering students.
 * @param reviewed - How many questions the AI returns.
 * @param pictured - How many of the first questions carry one picture each (question N has picture N).
 */
async function openReplaceDialog(
  user: ReturnType<typeof userEvent.setup>,
  counts: { existing: number; answered: number },
  reviewed: number,
  pictured = 0,
): Promise<void> {
  vi.mocked(extractDocx).mockResolvedValue({
    text: "doc",
    pictures: Array.from({ length: pictured }, (_, i) => ({
      number: i + 1,
      file: new File([`png-${i + 1}`], `picture-${i + 1}.png`, {
        type: "image/png",
      }),
    })),
  });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: `Extracted ${reviewed} question(s)`,
    questions: Array.from({ length: reviewed }, (_, i) => ({
      title: `Q${i + 1}`,
      content: "Explain photosynthesis.",
      type: "free_text" as const,
      imageNumbers: i < pictured ? [i + 1] : undefined,
    })),
  });
  render(
    <ImportAiProvider>
      <ImportAiFilePicker />
      <QuestionPreviewList
        testId="test-1"
        courseId="course-1"
        existingQuestionCount={counts.existing}
        answeredStudentCount={counts.answered}
      />
    </ImportAiProvider>,
  );
  await user.upload(screen.getByLabelText(/document/i), makeDocxFile());
  await screen.findByText("Q1");
  await user.click(screen.getByRole("radio", { name: /replace/i }));
  await user.click(
    screen.getByRole("button", { name: /^replace questions$/i }),
  );
}

describe("Feature: AI document import — replacing a test's questions warns and requires typed confirmation", () => {
  it('keeps Replace disabled until the teacher types "override", states what it deletes and adds and what happens to students who answered, and sends mode: replace on confirm', async () => {
    const user = userEvent.setup();
    vi.mocked(importAiQuestionsAction).mockResolvedValue({
      success: true,
      message: "Imported 2 question(s)",
      importedCount: 2,
    });
    await openReplaceDialog(user, { existing: 3, answered: 2 }, 2);
    // Opening the confirm dialog must not itself fire the import.
    expect(importAiQuestionsAction).not.toHaveBeenCalled();

    // The counts come from props and the live list, so different numbers prove each is used.
    expect(
      await screen.findByText(
        /deletes the test's 3 questions and adds the 2 reviewed questions/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/in progress/i)).toBeInTheDocument();
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    expect(screen.getByText(/at least 2 students/i)).toBeInTheDocument();
    expect(screen.getByText(/create a new test/i)).toBeInTheDocument();

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
      expect.anything(),
      "replace",
    );
    const [, , drafts] = vi.mocked(importAiQuestionsAction).mock.calls[0];
    expect(drafts).toHaveLength(2);
    expect(push).toHaveBeenCalledWith("/admin/courses/course-1/tests/test-1");
  });

  it("accepts the phrase with surrounding spaces and any capitalisation", async () => {
    const user = userEvent.setup();
    await openReplaceDialog(user, { existing: 3, answered: 0 }, 2);

    await user.type(
      await screen.findByLabelText(/type.*override.*to confirm/i),
      " Override ",
    );

    expect(
      screen.getByRole("button", { name: /^yes, replace$/i }),
    ).toBeEnabled();
  });

  it("leaves out the student sentence and the new-test suggestion when nobody has answered yet", async () => {
    const user = userEvent.setup();
    await openReplaceDialog(user, { existing: 3, answered: 0 }, 2);

    expect(
      await screen.findByText(/deletes the test's 3 questions/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/already answered/i)).toBeNull();
    expect(screen.queryByText(/create a new test/i)).toBeNull();
  });

  it("drops the deletes clause when the test has no questions", async () => {
    const user = userEvent.setup();
    await openReplaceDialog(user, { existing: 0, answered: 0 }, 2);

    expect(
      await screen.findByText("This adds the 2 reviewed questions."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/deletes/i)).toBeNull();
    expect(screen.queryByText(/create a new test/i)).toBeNull();
  });

  it("uses singular wording for one question and one student", async () => {
    const user = userEvent.setup();
    await openReplaceDialog(user, { existing: 1, answered: 1 }, 1);

    expect(
      await screen.findByText(
        "This deletes the test's 1 question and adds the 1 reviewed question.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/at least 1 student already answered/i),
    ).toBeInTheDocument();
  });

  it("deletes nothing when the second question's pictures fail to upload after the first question's uploaded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
    // Picture 1 gets a slot; picture 2's slot request is refused.
    vi.mocked(requestUploadSlotsAction).mockImplementation(async (files) =>
      files.some((file) => file.fileName === "picture-2.png")
        ? { success: false, message: "Upload slots unavailable" }
        : {
            success: true,
            message: "Upload slots created",
            slots: files.map((_, i) => ({
              key: `media/questions/k1-${i}.png`,
              url: `https://fake-s3.local/put/k1-${i}`,
              contentType: "image/png",
              order: i,
            })),
          },
    );
    await openReplaceDialog(user, { existing: 3, answered: 0 }, 2, 2);

    await user.type(
      await screen.findByLabelText(/type.*override.*to confirm/i),
      "override",
    );
    await user.click(screen.getByRole("button", { name: /^yes, replace$/i }));

    expect(
      await within(questionCard("Q2")).findByRole("alert"),
    ).toHaveTextContent(
      "Question 2 — Its pictures could not be uploaded: Upload slots unavailable",
    );
    // Replace deletes the old questions inside this call, so it must never run.
    expect(importAiQuestionsAction).not.toHaveBeenCalled();
  });
});
