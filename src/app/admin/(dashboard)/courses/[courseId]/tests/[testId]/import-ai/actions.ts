"use server";

import { headers } from "next/headers";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { questionImportItemSchema } from "src/lib/ai/question-import-schema";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import { getQuestionParseClient } from "src/lib/services-singleton";
import { z } from "zod";

/** Caps the text sent to Gemini — see D41 (a long exam paper stays affordable). */
const MAX_DOCUMENT_TEXT_LENGTH = 200_000;

const parseQuestionsSchema = z
  .string()
  .trim()
  .min(1, "No text was extracted from the document")
  .max(
    MAX_DOCUMENT_TEXT_LENGTH,
    "The document is too long to import in one go",
  );

export interface ParseQuestionsState {
  success: boolean;
  message: string;
  questions?: ParsedQuestion[];
}

/**
 * Server action: sends extracted document text to the AI parse client and
 * returns the structured questions for review. Makes no database write —
 * nothing is imported until Step 17's separate import action runs.
 * @param documentText - The full text extracted client-side from the upload.
 */
export async function parseQuestionsAction(
  documentText: string,
): Promise<ParseQuestionsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = parseQuestionsSchema.safeParse(documentText);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.parseQuestionsAction",
      {
        "lms.action.name": "parseQuestionsAction",
        "lms.import.document_text_length": parsed.data.length,
      },
      async () => {
        const parseClient = await getQuestionParseClient();
        const questions = await parseClient.parseQuestionsFromText(parsed.data);

        return {
          success: true,
          message: `Extracted ${questions.length} question(s)`,
          questions,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: "AI question extraction failed. Please try again.",
    };
  }
}

const retryQuestionSchema = z.object({
  documentText: parseQuestionsSchema,
  currentQuestion: questionImportItemSchema,
  correctionNote: z
    .string()
    .trim()
    .min(1, "Explain what was wrong with this question")
    .max(1000, "Keep the correction note under 1000 characters"),
});

export interface RetryQuestionState {
  success: boolean;
  message: string;
  question?: ParsedQuestion;
}

/**
 * Server action: re-reads ONE already-extracted question, addressing a
 * teacher's correction note. Makes no database write — nothing is imported
 * until Step 17's separate import action runs. Splicing the result back into
 * the review list is the caller's job (`retryOneQuestion` in
 * `import-ai-form.state.tsx`), scoped to that one question's id.
 * @param documentText - The full text extracted client-side from the upload.
 * @param currentQuestion - The question's current (possibly hand-edited) draft.
 * @param correctionNote - What the teacher says was wrong with it.
 */
export async function retryQuestionAction(
  documentText: string,
  currentQuestion: ParsedQuestion,
  correctionNote: string,
): Promise<RetryQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  try {
    await authService.requireAdminSession(requestHeaders);
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = retryQuestionSchema.safeParse({
    documentText,
    currentQuestion,
    correctionNote,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.retryQuestionAction",
      {
        "lms.action.name": "retryQuestionAction",
        "lms.import.document_text_length": parsed.data.documentText.length,
      },
      async () => {
        const parseClient = await getQuestionParseClient();
        const question = await parseClient.retryQuestion(
          parsed.data.documentText,
          parsed.data.currentQuestion,
          parsed.data.correctionNote,
        );

        return {
          success: true,
          message: "Question re-read",
          question,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: "AI retry failed. Please try again.",
    };
  }
}
