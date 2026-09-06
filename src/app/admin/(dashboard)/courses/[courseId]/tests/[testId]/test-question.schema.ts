import { z } from "zod";

const optionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

/**
 * An edited option: `id` present means "keep this option's id" (D53); a
 * genuinely new option omits it. Distinct from `optionSchema` above, which
 * has no id since every add-question option is new by definition.
 */
const editOptionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

/** Discriminated-union schema validating an add-question form submission. */
export const addQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("free_text"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    referenceAnswer: z.string().trim().optional(),
    explanation: z.string().trim().optional(),
    answerRevealMode: z.enum(["diff", "plain"]).optional(),
  }),
  z.object({
    type: z.literal("single_select"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
    explanation: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("multi_select"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
    mcGradingStrategy: z
      .enum(["all_or_nothing", "partial"])
      .default("all_or_nothing"),
    explanation: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("image_answer"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
  }),
]);

/**
 * Schema validating a question-edit form submission. Grows with Steps 26-28
 * as more fields become editable (D52/D29). Each editable field is optional
 * here because the panel renders a different subset per question type
 * (`answerRevealMode`/`referenceAnswer` are free-text-only per D8) — a field
 * absent from FormData stays absent from the parsed data, which the action
 * reads as "leave unchanged" rather than "clear". `"inherit"` is the form's
 * sentinel for explicitly clearing the reveal override back to the test's
 * own default — a real, reachable state distinct from unset.
 */
export const editQuestionSchema = z.object({
  questionId: z.string().min(1, "Question ID is missing"),
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  answerRevealMode: z.enum(["inherit", "diff", "plain"]).optional(),
  referenceAnswer: z.string().optional(),
  explanation: z.string().optional(),
  // Title/content have no "clear" state (D8's absent-means-inherit contract
  // doesn't apply — every question requires both), so title is validated
  // non-blank the same way addQuestionSchema's own title field is; addQuestion
  // never validates this today, so the edit path can't assume the service will.
  title: z.string().trim().min(1, "Question title is required").optional(),
  content: z.string().optional(),
  // Options are absent when the panel didn't render an options editor for
  // this question's type (Step 27); present means "replace the whole list".
  options: z
    .array(editOptionSchema)
    .min(2, "At least 2 options are required")
    .optional(),
});

/** Schema validating the JSON file body for bulk question import. */
export const importQuestionsFileSchema = z.array(
  z.object({
    title: z.string().min(1, "Each question must have a title"),
    content: z.string().min(1, "Each question must have content"),
  }),
);
