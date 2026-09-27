import { z } from "zod";

const optionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

/** An edited option: `id` present means "keep this option's id" (D53). */
const editOptionSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

/** Discriminated-union schema validating an add-pool-question form submission. */
export const addPoolQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("free_text"),
    poolId: z.string().min(1, "Pool ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    referenceAnswer: z.string().trim().optional(),
    explanation: z.string().trim().optional(),
    // "inherit" is the form's explicit "use the test's setting" choice —
    // the action treats it the same as absent.
    answerRevealMode: z.enum(["inherit", "diff", "plain"]).optional(),
  }),
  z.object({
    type: z.literal("single_select"),
    poolId: z.string().min(1, "Pool ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
    explanation: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal("multi_select"),
    poolId: z.string().min(1, "Pool ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
    mcGradingStrategy: z
      .enum(["all_or_nothing", "partial"])
      .default("all_or_nothing"),
    explanation: z.string().trim().optional(),
  }),
]);

/**
 * Schema validating a pool-question-edit form submission. Mirrors
 * `editQuestionSchema` (D30: a parallel path, not a shared one) — each
 * editable field is optional since the panel renders a different subset per
 * question type; a field absent from FormData stays "leave unchanged".
 */
export const editPoolQuestionSchema = z.object({
  poolQuestionId: z.string().min(1, "Pool question ID is missing"),
  poolId: z.string().min(1, "Pool ID is missing"),
  answerRevealMode: z.enum(["inherit", "diff", "plain"]).optional(),
  referenceAnswer: z.string().optional(),
  explanation: z.string().optional(),
  title: z.string().trim().min(1, "Question title is required").optional(),
  content: z.string().optional(),
  options: z
    .array(editOptionSchema)
    .min(2, "At least 2 options are required")
    .optional(),
  type: z.enum(["free_text", "single_select", "multi_select"]).optional(),
  // multi_select-only; absent means "leave unchanged".
  mcGradingStrategy: z.enum(["all_or_nothing", "partial"]).optional(),
});
