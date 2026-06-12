import { z } from "zod";

const optionSchema = z.object({
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
  }),
  z.object({
    type: z.literal("single_select"),
    poolId: z.string().min(1, "Pool ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().default(""),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
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
  }),
]);
