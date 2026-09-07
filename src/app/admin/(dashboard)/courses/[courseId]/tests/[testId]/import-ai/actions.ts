"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { questionImportItemSchema } from "src/lib/ai/question-import-schema";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  checkMcOptions,
  isMcQuestionType,
  type QuestionService,
} from "src/lib/question-service";
import {
  getQuestionParseClient,
  getQuestionService,
} from "src/lib/services-singleton";
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

export interface ImportAiQuestionsState {
  success: boolean;
  message: string;
  importedCount?: number;
  /** 0-indexed position of the offender named in `message` — Step 33 surfaces it against that question, not a bare banner. */
  invalidQuestionIndex?: number;
}

/**
 * Writes one reviewed draft via `addQuestion`, branching per type so each
 * call matches one of its overloads exactly (a union input type does not —
 * `addQuestion`'s overloads are not selectable from a widened union).
 * `mcGradingStrategy` for `multi_select` has no source in the AI-extracted
 * shape, so it defaults to `all_or_nothing`, matching the manual add form's
 * own default.
 * @param questionService - The service to write through.
 * @param testId - The test to add the question to.
 * @param question - One reviewed question, already validated by the caller.
 * @param createdBy - The importing admin's id.
 */
async function addReviewedQuestion(
  questionService: QuestionService,
  testId: string,
  question: ParsedQuestion,
  createdBy: string,
): Promise<void> {
  if (question.type === "single_select") {
    await questionService.addQuestion(
      testId,
      {
        type: "single_select",
        title: question.title,
        content: question.content,
        options: question.options ?? [],
        explanation: question.explanation,
        createdBy,
      },
      // D32: matches the relaxation findFirstQuestionError already validated with.
      { allowMissingAnswerKey: true },
    );
    return;
  }
  if (question.type === "multi_select") {
    await questionService.addQuestion(
      testId,
      {
        type: "multi_select",
        title: question.title,
        content: question.content,
        options: question.options ?? [],
        mcGradingStrategy: "all_or_nothing",
        explanation: question.explanation,
        createdBy,
      },
      // D32: matches the relaxation findFirstQuestionError already validated with.
      { allowMissingAnswerKey: true },
    );
    return;
  }
  await questionService.addQuestion(testId, {
    type: "free_text",
    title: question.title,
    content: question.content,
    referenceAnswer: question.referenceAnswer,
    explanation: question.explanation,
    createdBy,
  });
}

/**
 * Validates every reviewed question before any write, in list order, and
 * returns the first offender's message — or null when all are acceptable.
 * Transactions are architecturally unavailable here (no `startSession`
 * anywhere in the repo; the dev/CI Mongo is a standalone `mongo:7` with no
 * replica set, which multi-document transactions require), so this pre-pass
 * running to completion before any `insertOne` fires is the only mechanism
 * this codebase can support for "reject the batch, write nothing."
 *
 * Checks both layers per question — schema-level field validity, then the MC
 * option-count rule — so a batch cannot pass one layer, start writing, and
 * fail on the other. `allowMissingAnswerKey: true` (D32) is scoped to this
 * one call site: an AI-imported MC question with no correct option marked is
 * importable (flagged for the teacher, not rejected); every other write path
 * (manual add, JSON import, pool compose) is untouched and keeps today's
 * strict rule, since none of them call `checkMcOptions` with that option.
 *
 * This is validation, not atomicity: a mid-loop infra failure after this pass
 * succeeds (a dropped connection, a Mongo write error unrelated to the
 * validated business rule) can still leave a partial import — the same
 * residual every bulk insert in this codebase already carries
 * (`importQuestions`/`composeFromPools` use plain `insertMany`).
 * @param questions - The reviewed list, in the order the teacher left it.
 * @returns The first offender's index (0-based) and message, or null when every question passes.
 */
function findFirstQuestionError(
  questions: ParsedQuestion[],
): { index: number; message: string } | null {
  for (let i = 0; i < questions.length; i++) {
    const parsed = questionImportItemSchema.safeParse(questions[i]);
    if (!parsed.success) {
      const title = questions[i]?.title ?? "";
      return {
        index: i,
        message: `Question ${i + 1} ("${title}"): ${parsed.error.issues[0].message}`,
      };
    }

    if (isMcQuestionType(parsed.data.type)) {
      const mcError = checkMcOptions(
        parsed.data.type,
        parsed.data.options ?? null,
        { allowMissingAnswerKey: true },
      );
      if (mcError) {
        return {
          index: i,
          message: `Question ${i + 1} ("${parsed.data.title}"): ${mcError}`,
        };
      }
    }
  }

  return null;
}

/** D37: APPEND is the default; REPLACE also deletes the test's current questions first (Step 34). */
export type ImportMode = "append" | "replace";

/**
 * Server action: writes the teacher's reviewed AI-import list onto the test,
 * in review order — after validating the whole batch first, rejecting all of
 * it and writing nothing if any one question cannot be accepted.
 *
 * REPLACE (`mode: "replace"`) additionally soft-deletes every question
 * currently on the test (Step 29's `deleteQuestion`, one per question — no
 * bespoke bulk-delete) BEFORE the write loop runs. Ordering is load-bearing:
 * validation (above) always runs before ANY delete, and delete always
 * completes before the first insert — never interleaved — so a rejected
 * batch never strands the test with neither its old nor its new questions.
 * @param testId - The test to import onto.
 * @param courseId - Used only to revalidate the test's admin page.
 * @param questions - The reviewed list, in the order the teacher left it.
 * @param mode - "append" (default, D37) keeps existing questions; "replace" deletes them first.
 */
export async function importAiQuestionsAction(
  testId: string,
  courseId: string,
  questions: ParsedQuestion[],
  mode: ImportMode = "append",
): Promise<ImportAiQuestionsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const invalidQuestion = findFirstQuestionError(questions);
  if (invalidQuestion) {
    return {
      success: false,
      message: invalidQuestion.message,
      invalidQuestionIndex: invalidQuestion.index,
    };
  }

  try {
    return await withSpan(
      "action.importAiQuestionsAction",
      {
        "lms.action.name": "importAiQuestionsAction",
        "lms.test.id": testId,
        "lms.course.id": courseId,
        "lms.import.question_count": questions.length,
      },
      async () => {
        const questionService = await getQuestionService();

        // REPLACE deletes every existing question BEFORE the write loop
        // below — delete-then-insert, never interleaved. Validation (above)
        // has already run, so a rejected batch never reaches this point.
        if (mode === "replace") {
          const existing = await questionService.listQuestions(testId);
          for (const question of existing) {
            await questionService.deleteQuestion(question.id, adminUserId);
          }
        }

        // Sequential, never Promise.all/.map(async...): getNextOrder is a
        // fresh read-then-write per call, so parallel addQuestion calls race
        // on the same "current max order" and silently break ordering.
        for (const question of questions) {
          await addReviewedQuestion(
            questionService,
            testId,
            question,
            adminUserId,
          );
        }

        revalidatePath(`/admin/courses/${courseId}/tests/${testId}`);

        return {
          success: true,
          message: `Imported ${questions.length} question(s)`,
          importedCount: questions.length,
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to import questions";
    return { success: false, message };
  }
}
