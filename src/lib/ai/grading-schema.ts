import { z } from "zod";

/**
 * Zod schema for one graded free-text item the LLM must produce.
 *
 * - `score`: integer 0-100. The strict `.int().min(0).max(100)` bounds are the
 *   contract with the model; out-of-range values trigger a Zod rejection inside
 *   `generateText`, which surfaces as `AI_NoObjectGeneratedError`. The action
 *   layer's outer try/catch converts that to the pinned error message.
 * - `feedback`: short, surgical comment shown side-by-side to the teacher.
 *   Capped to 2000 chars so a runaway model can't break the UI.
 */
export const aiGradeItemSchema = z.object({
  questionId: z.string(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().min(1).max(2000),
});

/**
 * Zod schema for the LLM's batch output. Wrapped in a `{ grades: [...] }`
 * object because Gemini's structured-output mode is more reliable with a
 * named top-level object than a bare array.
 */
export const aiGradeBatchSchema = z.object({
  grades: z.array(aiGradeItemSchema),
});

export type AiGradeBatchSchema = z.infer<typeof aiGradeBatchSchema>;
