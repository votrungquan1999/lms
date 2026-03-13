"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { getGradeService, getTestFeedbackService } from "src/lib/services-singleton";
import { z } from "zod";

const gradeQuestionSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  questionId: z.string().min(1),
  studentId: z.string().min(1),
  score: z.coerce.number().int().min(0).max(100),
  feedback: z.string(),
  solution: z.string().optional(),
});

const testFeedbackSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  feedback: z.string().min(1, "Feedback is required"),
});

export interface GradeQuestionState {
  success: boolean;
  message: string;
}

export interface TestFeedbackState {
  success: boolean;
  message: string;
}

/**
 * Server action: grades a student's answer for a question.
 */
export async function gradeQuestionAction(
  _prevState: GradeQuestionState | null,
  formData: FormData,
): Promise<GradeQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = gradeQuestionSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    questionId: formData.get("questionId"),
    studentId: formData.get("studentId"),
    score: formData.get("score"),
    feedback: formData.get("feedback"),
    solution: formData.get("solution") || undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const gradeService = await getGradeService();
    await gradeService.gradeQuestion({
      testId: parsed.data.testId,
      questionId: parsed.data.questionId,
      studentId: parsed.data.studentId,
      score: parsed.data.score,
      feedback: parsed.data.feedback,
      solution: parsed.data.solution,
      gradedBy: adminUserId,
    });

    revalidatePath(
      `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
    );

    return { success: true, message: "Grade saved" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to save grade",
    };
  }
}

/**
 * Server action: sets overall test feedback for a student.
 */
export async function setTestFeedbackAction(
  _prevState: TestFeedbackState | null,
  formData: FormData,
): Promise<TestFeedbackState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = testFeedbackSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    feedback: formData.get("feedback"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const testFeedbackService = await getTestFeedbackService();
    await testFeedbackService.setTestFeedback({
      testId: parsed.data.testId,
      studentId: parsed.data.studentId,
      feedback: parsed.data.feedback,
      gradedBy: adminUserId,
    });

    revalidatePath(
      `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
    );

    return { success: true, message: "Feedback saved" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to save feedback",
    };
  }
}
