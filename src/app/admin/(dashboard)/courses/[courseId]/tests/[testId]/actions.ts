"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { getQuestionService } from "src/lib/services-singleton";
import { z } from "zod";

const optionSchema = z.object({
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
});

const addQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("free_text"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().min(1, "Question content is required"),
  }),
  z.object({
    type: z.literal("single_select"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().min(1, "Question content is required"),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
  }),
  z.object({
    type: z.literal("multi_select"),
    testId: z.string().min(1, "Test ID is missing"),
    courseId: z.string().min(1, "Course ID is missing"),
    title: z.string().trim().min(1, "Question title is required"),
    content: z.string().min(1, "Question content is required"),
    options: z.array(optionSchema).min(2, "At least 2 options are required"),
    mcGradingStrategy: z.enum(["all_or_nothing", "partial"]).default("all_or_nothing"),
  }),
]);

const importQuestionsFileSchema = z.array(
  z.object({
    title: z.string().min(1, "Each question must have a title"),
    content: z.string().min(1, "Each question must have content"),
  }),
);

export interface AddQuestionState {
  success: boolean;
  message: string;
}

export interface ImportQuestionsState {
  success: boolean;
  message: string;
}

/**
 * Server action: adds a single question to a test.
 */
export async function addQuestionAction(
  _prevState: AddQuestionState | null,
  formData: FormData,
): Promise<AddQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const type = (formData.get("type") ?? "free_text").toString() as
    | "free_text"
    | "single_select"
    | "multi_select";

  // Parse MC options if present
  const optionsJson = formData.get("options")?.toString();
  let options: { text: string; isCorrect: boolean }[] | undefined;
  if (optionsJson) {
    try {
      options = JSON.parse(optionsJson);
    } catch {
      return { success: false, message: "Invalid options format" };
    }
  }

  const parsed = addQuestionSchema.safeParse({
    type,
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    title: formData.get("title"),
    content: formData.get("content"),
    ...(options !== undefined && { options }),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const questionService = await getQuestionService();
    const data = parsed.data;
    if (data.type === "free_text") {
      await questionService.addQuestion(data.testId, {
        title: data.title,
        content: data.content,
        type: "free_text",
        createdBy: adminUserId,
      });
    } else if (data.type === "single_select") {
      await questionService.addQuestion(data.testId, {
        title: data.title,
        content: data.content,
        type: "single_select",
        options: data.options,
        createdBy: adminUserId,
      });
    } else {
      await questionService.addQuestion(data.testId, {
        title: data.title,
        content: data.content,
        type: "multi_select",
        options: data.options,
        mcGradingStrategy: data.mcGradingStrategy,
        createdBy: adminUserId,
      });
    }

    revalidatePath(
      `/admin/courses/${data.courseId}/tests/${data.testId}`,
    );

    return {
      success: true,
      message: `Question "${data.title}" added successfully`,
    };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to add question";
    return { success: false, message };
  }
}

/**
 * Server action: imports questions from a JSON file.
 * Expected format: [{ "title": "...", "content": "..." }, ...]
 */
export async function importQuestionsAction(
  _prevState: ImportQuestionsState | null,
  formData: FormData,
): Promise<ImportQuestionsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const testId = formData.get("testId")?.toString() ?? "";
  const courseId = formData.get("courseId")?.toString() ?? "";
  const file = formData.get("file") as File | null;

  if (!testId) {
    return { success: false, message: "Test ID is missing" };
  }

  if (!file || file.size === 0) {
    return { success: false, message: "Please select a JSON file" };
  }

  try {
    const text = await file.text();
    const rawParsed = JSON.parse(text);

    const validated = importQuestionsFileSchema.safeParse(rawParsed);
    if (!validated.success) {
      return {
        success: false,
        message: validated.error.issues[0].message,
      };
    }

    const questionService = await getQuestionService();
    const imported = await questionService.importQuestions(
      testId,
      validated.data,
      adminUserId,
    );

    revalidatePath(`/admin/courses/${courseId}/tests/${testId}`);

    return {
      success: true,
      message: `Successfully imported ${imported.length} question(s)`,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("JSON parse error:", error.message);
      return { success: false, message: "Invalid JSON file" };
    }
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to import questions";
    return { success: false, message };
  }
}
