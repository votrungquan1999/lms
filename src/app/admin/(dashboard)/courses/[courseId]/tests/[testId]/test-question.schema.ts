import { z } from "zod";

const optionSchema = z.object({
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

/** Schema validating the JSON file body for bulk question import. */
export const importQuestionsFileSchema = z.array(
  z.object({
    title: z.string().min(1, "Each question must have a title"),
    content: z.string().min(1, "Each question must have content"),
  }),
);
