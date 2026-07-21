"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getAnswerService,
  getEnrollmentService,
  getRedoRequestService,
  getTestStartService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import type { StudentSession } from "src/lib/session";
import { z } from "zod";
import { MAX_ANSWER_IMAGES } from "./answer-image-upload.schema";

const submitAnswerSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
  questionId: z.string().min(1, "Question ID is missing"),
  // For free-text, 'answer' contains the text.
  // For MC, 'selectedIds' contains a JSON array of option IDs; 'answer' may be absent.
  answer: z.string().optional(),
  selectedIds: z.string().optional(), // JSON-encoded string[] for MC
  mediaKeys: z.string().optional(), // JSON-encoded string[] for image answers
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
    mediaKeys: formData.get("mediaKeys") ?? undefined,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  const { testId, courseId, questionId, answer, selectedIds, mediaKeys } =
    parsed.data;

  // Validate that at least one answer type is provided
  if (!answer && !selectedIds && !mediaKeys) {
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
    return await withSpan(
      "action.submitAnswerAction",
      {
        "lms.action.name": "submitAnswerAction",
        "lms.test.id": testId,
        "lms.course.id": courseId,
        "lms.student.id": studentId,
        "lms.answer.type": mediaKeys
          ? "image"
          : selectedIds
            ? "mc"
            : "free_text",
      },
      async () => {
        const answerService = await getAnswerService();

        if (mediaKeys) {
          // Image answer (photos of handwritten work)
          let keys: string[];
          try {
            keys = JSON.parse(mediaKeys);
          } catch {
            return { success: false, message: "Invalid photo upload format" };
          }

          // The client sends raw S3 keys; validate them before persisting.
          // Reading these keys later mints signed GET URLs, so an unchecked
          // key is a read-scope IDOR over the whole bucket. Keys must live
          // under the caller's own namespace and stay within the photo cap.
          const ownPrefix = `answers/${studentId}/`;
          const keysValid =
            keys.length > 0 &&
            keys.length <= MAX_ANSWER_IMAGES &&
            keys.every(
              (k) =>
                k.startsWith(ownPrefix) &&
                !k.slice(ownPrefix.length).includes("/"),
            );
          if (!keysValid) {
            return { success: false, message: "Invalid photo upload" };
          }

          await answerService.submitAnswer({
            testId,
            questionId,
            studentId,
            answer: { type: "image", mediaKeys: keys },
          });
        } else if (selectedIds) {
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
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    const message =
      error instanceof Error ? error.message : "Failed to submit answer";
    return { success: false, message };
  }
}

const startTestSchema = z.object({
  testId: z.string().min(1, "Test ID is missing"),
  courseId: z.string().min(1, "Course ID is missing"),
});

export interface StartTestState {
  success: boolean;
  message: string;
}

/**
 * Server action: records the start of a timed test for the current student.
 * Student-guarded and enrollment-checked; idempotent start recording is
 * delegated to `TestStartService.recordStart` (starting twice is harmless).
 */
export async function startTest(
  _prevState: StartTestState | null,
  formData: FormData,
): Promise<StartTestState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let studentId: string;
  try {
    const session = await authService.requireStudentSession(requestHeaders);
    studentId = (session as StudentSession).studentId;
  } catch {
    return { success: false, message: "Unauthorized: student access required" };
  }

  const parsed = startTestSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }
  const { testId, courseId } = parsed.data;

  const enrollmentService = await getEnrollmentService();
  const enrolled = await enrollmentService.isEnrolled(courseId, studentId);
  if (!enrolled) {
    return { success: false, message: "You are not enrolled in this course" };
  }

  try {
    return await withSpan(
      "action.startTest",
      {
        "lms.action.name": "startTest",
        "lms.test.id": testId,
        "lms.course.id": courseId,
        "lms.student.id": studentId,
      },
      async () => {
        const testStartService = await getTestStartService();
        await testStartService.recordStart(testId, studentId, new Date());

        revalidatePath(`/student/courses/${courseId}/tests/${testId}`);

        return { success: true, message: "Test started" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to start test",
    };
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
    return await withSpan(
      "action.submitTestAction",
      {
        "lms.action.name": "submitTestAction",
        "lms.test.id": testId,
        "lms.course.id": courseId,
        "lms.student.id": studentId,
      },
      async () => {
        const testSubmissionService = await getTestSubmissionService();
        const redoRequestService = await getRedoRequestService();

        // Check for an active redo request — if one exists, remove the old submission
        // so submitTest() can create a fresh one (which re-triggers auto-grading on new answers)
        const activeRedo = await redoRequestService.getActiveRedoRequest(
          testId,
          studentId,
        );
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
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to submit test",
    };
  }
}
