"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import {
  getAnswerService,
  getEnrollmentService,
  getRedoRequestService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import type { StudentSession } from "src/lib/session";
import { z } from "zod";

const submitAnswerSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  questionId: z.string().min(1, "Question ID is missing"),
  // For free-text, 'answer' contains the text.
  // For MC, 'selectedIds' contains a JSON array of option IDs; 'answer' may be absent.
  answer: z.string().optional(),
  selectedIds: z.string().optional(), // JSON-encoded string[] for MC
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
    answer: formData.get("answer") ?? undefined,
    selectedIds: formData.get("selectedIds") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const { testId, courseId, questionId, answer, selectedIds } = parsed.data;

  // Validate that at least one answer type is provided
  if (!answer && !selectedIds) {
    return { success: false, message: "Answer cannot be empty" };
  }

  // Verify enrollment
  const enrollmentService = await getEnrollmentService();
  const enrolled = await enrollmentService.isEnrolled(courseId, studentId);
  if (!enrolled) {
    return {
      success: false,
      message: "You are not enrolled in this course",
    };
  }

  try {
    const answerService = await getAnswerService();

    if (selectedIds) {
      // MC answer
      let ids: string[];
      try {
        ids = JSON.parse(selectedIds);
      } catch {
        return { success: false, message: "Invalid MC selection format" };
      }
      await answerService.submitAnswer({
        testId,
        questionId,
        studentId,
        answer: { type: "mc", selectedIds: ids },
      });
    } else {
      // Free-text answer
      await answerService.submitAnswer({
        testId,
        questionId,
        studentId,
        answer: { type: "free_text", text: answer as string },
      });
    }

    revalidatePath(`/student/courses/${courseId}/tests/${testId}`);

    return { success: true, message: "Answer submitted successfully" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to submit answer";
    return { success: false, message };
  }
}

export interface SubmitTestState {
  success: boolean;
  message: string;
}

/**
 * Server action: explicitly submits a test for grading.
 * Allows partial submissions — student doesn't need to answer all questions.
 */
export async function submitTestAction(
  _prevState: SubmitTestState | null,
  formData: FormData,
): Promise<SubmitTestState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let studentId: string;
  try {
    const session = await authService.requireStudentSession(requestHeaders);
    studentId = (session as StudentSession).studentId;
  } catch {
    return { success: false, message: "Unauthorized: student access required" };
  }

  const testId = formData.get("testId")?.toString() ?? "";
  const courseId = formData.get("courseId")?.toString() ?? "";

  if (!testId || !courseId) {
    return { success: false, message: "Missing test or course ID" };
  }

  const enrollmentService = await getEnrollmentService();
  const enrolled = await enrollmentService.isEnrolled(courseId, studentId);
  if (!enrolled) {
    return { success: false, message: "You are not enrolled in this course" };
  }

  try {
    const testSubmissionService = await getTestSubmissionService();
    const redoRequestService = await getRedoRequestService();

    // Check for an active redo request — if one exists, remove the old submission
    // so submitTest() can create a fresh one (which re-triggers auto-grading on new answers)
    const activeRedo = await redoRequestService.getActiveRedoRequest(testId, studentId);
    if (activeRedo) {
      await testSubmissionService.deleteSubmission(testId, studentId);
    }

    await testSubmissionService.submitTest(testId, studentId);

    // Resolve the redo request after successful submission
    if (activeRedo) {
      await redoRequestService.resolveRedoRequest(testId, studentId);
    }

    revalidatePath(`/student/courses/${courseId}/tests/${testId}`);
    revalidatePath(`/student/courses/${courseId}`);

    return { success: true, message: "Test submitted for grading" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to submit test",
    };
  }
}

