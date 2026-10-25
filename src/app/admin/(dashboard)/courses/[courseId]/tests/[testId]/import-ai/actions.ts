"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ParsedQuestion } from "src/lib/ai/ai-client";
import { classifyAiFailure } from "src/lib/ai/ai-failure-cause";
import { AI_FAILURE_MESSAGES } from "src/lib/ai/ai-failure-messages";
import {
  draftQuestionSchema,
  questionImportItemSchema,
} from "src/lib/ai/question-import-schema";
import { getAuthService } from "src/lib/auth-singleton";
import { logError } from "src/lib/observability/log-error";
import { withSpan } from "src/lib/observability/with-span";
import { pluralize } from "src/lib/pluralize";
import {
  checkMcOptions,
  isMcQuestionType,
  type QuestionService,
} from "src/lib/question-service";
import {
  getQuestionParseClient,
  getQuestionService,
  getTestService,
} from "src/lib/services-singleton";
import { z } from "zod";
import {
  type SubmittedMedia,
  submittedMediaSchema,
} from "../question-media.schema";
import { resolveOwnedTest } from "../test-parent-check";

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

/** The picture numbers the browser extracted; a PDF sends none. */
const pictureNumbersSchema = z.array(z.number().int().positive()).max(1000);

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
 * @param pictureNumbers - The numbers of the pictures extracted client-side;
 *   none for a PDF.
 */
export async function parseQuestionsAction(
  documentText: string,
  pictureNumbers: number[] = [],
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
  const numbers = pictureNumbersSchema.safeParse(pictureNumbers);
  if (!numbers.success) {
    return {
      success: false,
      message: "The document's pictures could not be read",
    };
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
        const questions = await parseClient.parseQuestionsFromText(
          parsed.data,
          numbers.data,
        );

        return {
          success: true,
          message: `Extracted ${questions.length} ${pluralize(questions.length, "question")}`,
          questions,
        };
      },
    );
  } catch (error) {
    logError(error);
    return {
      success: false,
      message: AI_FAILURE_MESSAGES[classifyAiFailure(error)],
    };
  }
}

/**
 * Words a failed question check so the teacher can find the field: an emptied
 * text is named, anything else keeps the schema's own message.
 * @param issue - The first issue the question schema reported.
 * @returns The reason, without any question prefix.
 */
function describeQuestionIssue(issue: z.core.$ZodIssue): string {
  if (issue.code !== "too_small" || issue.origin !== "string") {
    return issue.message;
  }
  const [field, index, optionField] = issue.path;
  if (field === "title" || field === "content") return `${field} is empty`;
  if (
    field === "options" &&
    typeof index === "number" &&
    optionField === "text"
  ) {
    return `option ${index + 1} is empty`;
  }
  return issue.message;
}

const retryQuestionSchema = z.object({
  documentText: parseQuestionsSchema,
  currentQuestion: draftQuestionSchema,
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
    const [issue] = parsed.error.issues;
    // Only the question draft's own fields are named after the question.
    const message =
      issue.path[0] === "currentQuestion"
        ? `Question: ${describeQuestionIssue({ ...issue, path: issue.path.slice(1) })}`
        : issue.message;
    return { success: false, message };
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
    logError(error);
    return {
      success: false,
      message: AI_FAILURE_MESSAGES[classifyAiFailure(error)],
    };
  }
}

/** One question as the teacher imports it: the reviewed AI fields plus its already-uploaded pictures. */
export interface ReviewedQuestion extends Omit<ParsedQuestion, "imageNumbers"> {
  media?: SubmittedMedia;
}

export interface ImportAiQuestionsState {
  success: boolean;
  message: string;
  importedCount?: number;
  /** 0-indexed position of the offender named in `message` — Step 33 surfaces it against that question, not a bare banner. */
  invalidQuestionIndex?: number;
  /** The offender's rejection without the `Question N ("title"): ` prefix, so a view can label it by its own numbering. */
  invalidQuestionReason?: string;
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
  question: ReviewedQuestion,
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
        media: question.media,
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
        media: question.media,
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
    media: question.media,
    createdBy,
  });
}

/**
 * Copies a reviewed question with its title, content and choice texts trimmed,
 * so a spaces-only text fails the same minimum-length check an empty one does.
 * @param question - The reviewed question as submitted.
 * @returns The trimmed copy, used for validation only.
 */
function trimTexts(question: ReviewedQuestion): ReviewedQuestion {
  return {
    ...question,
    title: question.title?.trim(),
    content: question.content?.trim(),
    options: question.options?.map((option) => ({
      ...option,
      text: option.text?.trim(),
    })),
  };
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
 * Checks every layer per question — schema-level field validity, its
 * pictures, then the MC option-count rule — so a batch cannot pass one layer,
 * start writing, and fail on another. `allowMissingAnswerKey: true` (D32) is scoped to this
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
 * @returns The first offender's index (0-based), message and bare reason, or null when every question passes.
 */
function findFirstQuestionError(
  questions: ReviewedQuestion[],
): { index: number; message: string; reason: string } | null {
  for (let i = 0; i < questions.length; i++) {
    // Spaces-only text counts as empty; the import itself keeps the text as typed.
    const parsed = questionImportItemSchema.safeParse(trimTexts(questions[i]));
    if (!parsed.success) {
      const title = questions[i]?.title ?? "";
      return {
        index: i,
        message: `Question ${i + 1} ("${title}"): ${describeQuestionIssue(parsed.error.issues[0])}`,
        reason: describeQuestionIssue(parsed.error.issues[0]),
      };
    }

    // The browser built this list, so its pictures get the same check as the manual add form's.
    const media = submittedMediaSchema
      .optional()
      .safeParse(questions[i]?.media);
    if (!media.success) {
      return {
        index: i,
        message: `Question ${i + 1} ("${parsed.data.title}"): ${media.error.issues[0].message}`,
        reason: media.error.issues[0].message,
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
          reason: mcError,
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
  questions: ReviewedQuestion[],
  mode: ImportMode = "append",
): Promise<ImportAiQuestionsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  // An empty list would make REPLACE wipe the test and write nothing.
  if (questions.length === 0) {
    return { success: false, message: "There are no questions to import." };
  }

  const invalidQuestion = findFirstQuestionError(questions);
  if (invalidQuestion) {
    return {
      success: false,
      message: invalidQuestion.message,
      invalidQuestionIndex: invalidQuestion.index,
      invalidQuestionReason: invalidQuestion.reason,
    };
  }

  // Runs before REPLACE's delete loop and outside the try/catch below — a
  // foreign test must never reach the REPLACE-only "partial import" message.
  try {
    const testService = await getTestService(schoolId);
    await resolveOwnedTest(testService, testId, courseId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test not found";
    return { success: false, message };
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
        const questionService = await getQuestionService(schoolId);

        // REPLACE deletes every existing question BEFORE the write loop
        // below — delete-then-insert, never interleaved. Validation (above)
        // has already run, so a rejected batch never reaches this point.
        if (mode === "replace") {
          const existing = await questionService.listQuestions(testId);
          for (const question of existing) {
            await questionService.deleteQuestion(
              testId,
              question.id,
              adminUserId,
            );
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
          message: `Imported ${questions.length} ${pluralize(questions.length, "question")}`,
          importedCount: questions.length,
        };
      },
    );
  } catch (error) {
    logError(error);

    // REPLACE deletes before inserting (above); an infra fault here (not a
    // validated business-rule rejection — those return earlier) can leave
    // some old questions gone and the new set partial or absent. There are
    // no transactions to prevent this (standalone MongoDB, no replica set),
    // so the message says so plainly instead of implying nothing happened —
    // APPEND's only failure mode is milder (a partial addition onto an
    // intact old set), so it keeps the raw error message below.
    if (mode === "replace") {
      return {
        success: false,
        message:
          "Replacing this test's questions failed partway through — the test may now hold a mix of old and new questions. Check the test before trying again.",
      };
    }

    const message =
      error instanceof Error ? error.message : "Failed to import questions";
    return { success: false, message };
  }
}
