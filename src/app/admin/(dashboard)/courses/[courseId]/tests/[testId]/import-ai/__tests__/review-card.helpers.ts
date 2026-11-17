import { render, screen } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { createElement } from "react";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { vi } from "vitest";
import { parseQuestionsAction } from "../actions";
import { extractDocx } from "../document-extract";
import { ImportAiProvider } from "../import-ai-form.state";
import {
  ImportAiFilePicker,
  QuestionPreviewList,
} from "../question-preview.ui";

/**
 * Matches a review card's heading, "Question N: <title>", for a draft's title.
 * @param title - The question's title.
 * @returns A matcher for `getByText` / `findByText`.
 */
export function cardTitleText(title: string): RegExp {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Question \\d+: ${escaped}$`);
}

/**
 * Finds a review card's heading element by the draft's title.
 * @param title - The question's title.
 * @returns The heading element.
 */
export function cardTitle(title: string): HTMLElement {
  return screen.getByText(cardTitleText(title));
}

/**
 * Finds one question's review card by its title.
 * @param title - The question's title.
 * @returns The card element.
 */
export function questionCard(title: string): HTMLElement {
  return cardTitle(title).closest('[data-slot="card"]') as HTMLElement;
}

/**
 * Renders the import page and uploads a document whose AI result is the given drafts.
 * The caller's file must `vi.mock` `../document-extract` and `../actions`.
 * @param user - The user-event instance driving the page.
 * @param drafts - The drafts the AI returns, in order.
 */
export async function uploadDrafts(
  user: ReturnType<typeof userEvent.setup>,
  drafts: ParsedQuestion[],
): Promise<void> {
  vi.mocked(extractDocx).mockResolvedValue({ text: "doc", pictures: [] });
  vi.mocked(parseQuestionsAction).mockResolvedValue({
    success: true,
    message: `Extracted ${drafts.length} question(s)`,
    questions: drafts,
  });
  render(
    createElement(
      ImportAiProvider,
      null,
      createElement(ImportAiFilePicker),
      createElement(QuestionPreviewList, {
        testId: "test-1",
        courseId: "course-1",
        existingQuestionCount: 0,
        answeredStudentCount: 0,
      }),
    ),
  );
  await user.upload(
    screen.getByLabelText(/document/i),
    new File(["dummy"], "questions.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  await screen.findByText(cardTitleText(drafts[0].title));
}
