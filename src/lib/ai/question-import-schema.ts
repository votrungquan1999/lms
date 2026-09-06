import { z } from "zod";

const questionImportOptionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
});

/**
 * Zod schema for one question the LLM extracted from an uploaded document.
 * `type` excludes `image_answer` — there is no image for the model to grade
 * against in a text document, so the AI never emits that type.
 */
export const questionImportItemSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(["free_text", "single_select", "multi_select"]),
  options: z.array(questionImportOptionSchema).optional(),
  // Same shape as aiGradeItemSchema.solution: optional, but .min(1) so the
  // model must OMIT the key when the source has nothing, never emit "".
  referenceAnswer: z.string().min(1).max(4000).optional(),
  explanation: z.string().min(1).max(4000).optional(),
});

/**
 * Zod schema for the LLM's batch output. Wrapped in a `{ questions: [...] }`
 * object for the same reliability reason as `aiGradeBatchSchema`.
 */
export const questionImportBatchSchema = z.object({
  questions: z.array(questionImportItemSchema),
});

export type QuestionImportItem = z.infer<typeof questionImportItemSchema>;

/**
 * Zod schema for a single-question retry result. Wrapped in a
 * `{ question: {...} }` object for the same reliability reason as
 * `questionImportBatchSchema`'s `{ questions: [...] }`.
 */
export const questionRetryResultSchema = z.object({
  question: questionImportItemSchema,
});
