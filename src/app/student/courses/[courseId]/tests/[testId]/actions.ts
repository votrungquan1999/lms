"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import type { StudentSession } from "src/lib/session";
import {
  getAnswerService,
  getEnrollmentService,
} from "src/lib/services-singleton";
import { z } from "zod";

const submitAnswerSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  questionId: z.string().min(1, "Question ID is missing"),
  answer: z.string().min(1, "Answer cannot be empty"),
});

export interface SubmitAnswerState {
  success: boolean;
  message: string;
}

/**
 * Server action: submits (or updates) a student's answer for a single question.
 * Creates a new append-only answer record — never updates existing ones.
 */
export async function submitAnswerAction(
  _prevState: SubmitAnswerState | null,
  formData: FormData,
): Promise<SubmitAnswerState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let studentId: string;
  try {
    const session = await authService.requireStudentSession(requestHeaders);
    studentId = (session as StudentSession).studentId;
  } catch {
    return { success: false, message: "Unauthorized: student access required" };
  }

  const parsed = submitAnswerSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    questionId: formData.get("questionId"),
    answer: formData.get("answer"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  // Verify enrollment
  const enrollmentService = await getEnrollmentService();
  const enrolled = await enrollmentService.isEnrolled(
    parsed.data.courseId,
    studentId,
  );
  if (!enrolled) {
    return {
      success: false,
      message: "You are not enrolled in this course",
    };
  }

  try {
    const answerService = await getAnswerService();
    await answerService.submitAnswer({
      testId: parsed.data.testId,
      questionId: parsed.data.questionId,
      studentId,
      answer: parsed.data.answer,
    });

    revalidatePath(
      `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
    );

    return { success: true, message: "Answer submitted successfully" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to submit answer";
    return { success: false, message };
  }
}
