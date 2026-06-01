"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getGradeService,
  getQuestionService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestService,
  getTestStatusService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
import { TestStatus } from "src/lib/test-status-service";
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
    return await withSpan(
      "action.gradeQuestionAction",
      {
        "lms.action.name": "gradeQuestionAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
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
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath("/admin/dashboard");

        return { success: true, message: "Grade saved" };
      },
    );
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
    return await withSpan(
      "action.setTestFeedbackAction",
      {
        "lms.action.name": "setTestFeedbackAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
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
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath("/admin/dashboard");

        return { success: true, message: "Feedback saved" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to save feedback",
    };
  }
}

const releaseGradesSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
});

export interface ReleaseGradesState {
  success: boolean;
  message: string;
}

/**
 * Server action: releases grades to students for a delayed-release test.
 */
export async function releaseGradesAction(
  _prevState: ReleaseGradesState | null,
  formData: FormData,
): Promise<ReleaseGradesState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = releaseGradesSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.releaseGradesAction",
      {
        "lms.action.name": "releaseGradesAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
      },
      async () => {
        const testService = await getTestService();
        await testService.releaseGrades(parsed.data.testId, adminUserId);

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
        );
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath("/admin/dashboard");
        // Pre-existing gap: a global release must also propagate to the student
        // page so the student sees grades on the next visit.
        revalidatePath(
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );

        return { success: true, message: "Grades released" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to release grades",
    };
  }
}

const requestRedoSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
});

export interface RequestRedoState {
  success: boolean;
  message: string;
}

/**
 * Server action: requests a student to redo a test.
 * Creates an active RedoRequest so the student sees a banner next time they
 * open the test page.
 */
export async function requestRedoAction(
  _prevState: RequestRedoState | null,
  formData: FormData,
): Promise<RequestRedoState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = requestRedoSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.requestRedoAction",
      {
        "lms.action.name": "requestRedoAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
        const redoRequestService = await getRedoRequestService();
        await redoRequestService.requestRedo(
          parsed.data.testId,
          parsed.data.studentId,
          adminUserId,
        );

        // Revalidate admin grading paths (course-scoped + hub + variant + dashboard) and student test page
        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
        );
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath("/admin/dashboard");
        revalidatePath(
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );

        return { success: true, message: "Redo requested" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to request redo",
    };
  }
}

const releaseGradeForStudentSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
});

export interface ReleaseGradeForStudentState {
  success: boolean;
  message: string;
  releasedAt: string | null;
}

/**
 * Server action: stamps `releasedAt` / `releasedBy` on a single student's
 * active submission, opening the per-student tier of the visibility gate.
 * Used when the test has delayed release (`!showGradeAfterSubmit && !gradesReleasedAt`).
 */
export async function releaseGradeForStudentAction(
  _prevState: ReleaseGradeForStudentState | null,
  formData: FormData,
): Promise<ReleaseGradeForStudentState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return {
      success: false,
      message: "Unauthorized: admin access required",
      releasedAt: null,
    };
  }

  const parsed = releaseGradeForStudentSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
      releasedAt: null,
    };
  }

  try {
    return await withSpan(
      "action.releaseGradeForStudentAction",
      {
        "lms.action.name": "releaseGradeForStudentAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
        const testSubmissionService = await getTestSubmissionService();
        await testSubmissionService.releaseGradeToStudent(
          parsed.data.testId,
          parsed.data.studentId,
          adminUserId,
        );

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
        );
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath("/admin/dashboard");
        revalidatePath(
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );

        return {
          success: true,
          message: "Grade released to student",
          releasedAt: new Date().toISOString(),
        };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to release grade",
      releasedAt: null,
    };
  }
}

const saveAndJumpToNextSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  questionId: z.string().min(1),
  studentId: z.string().min(1),
  currentStudentId: z.string().min(1),
  candidateIds: z.string().min(1),
  returnPath: z.string().min(1),
  mode: z.enum(["student", "question"]),
  score: z.coerce.number().int().min(0).max(100),
  feedback: z.string(),
  solution: z.string().optional(),
  sort: z.string().optional(),
});

/**
 * Server action: grades a question for the current student and then redirects
 * to the next ungraded item.
 *
 * - Student-mode: jumps to the next student in `candidateIds` (after the
 *   current student) whose post-save `TestStatus === Submitted`.
 * - Question-mode: jumps to the next student in `candidateIds` whose grade
 *   for the active question is still missing after this save.
 *
 * If no next ungraded item exists, redirects back to the current URL.
 *
 * IMPORTANT: `redirect()` throws `NEXT_REDIRECT` and is called OUTSIDE the
 * try/catch wrapping the persist so the redirect propagates correctly.
 */
export async function saveAndJumpToNextAction(formData: FormData) {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  const session = await authService.requireAdminSession(requestHeaders);
  const adminUserId = session.userId;

  const parsed = saveAndJumpToNextSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    questionId: formData.get("questionId"),
    studentId: formData.get("studentId"),
    currentStudentId: formData.get("currentStudentId"),
    candidateIds: formData.get("candidateIds"),
    returnPath: formData.get("returnPath"),
    mode: formData.get("mode"),
    score: formData.get("score"),
    feedback: formData.get("feedback"),
    solution: formData.get("solution") || undefined,
    sort: formData.get("sort") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid form data");
  }

  const gradeService = await getGradeService();
  // Wrap ONLY the persist block — the next-student lookup loop and the trailing
  // redirect() stay outside the span (redirect throws NEXT_REDIRECT, which must
  // not be recorded as a span error).
  await withSpan(
    "action.saveAndJumpToNextAction",
    {
      "lms.action.name": "saveAndJumpToNextAction",
      "lms.test.id": parsed.data.testId,
      "lms.course.id": parsed.data.courseId,
      "lms.student.id": parsed.data.studentId,
    },
    async () => {
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
      revalidatePath("/admin/grading");
      revalidatePath(`/admin/grading/${parsed.data.testId}`);
      revalidatePath("/admin/dashboard");
    },
  );

  const candidates = parsed.data.candidateIds
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const currentIndex = candidates.indexOf(parsed.data.currentStudentId);
  const after =
    currentIndex >= 0 ? candidates.slice(currentIndex + 1) : candidates;

  let nextStudentId: string | undefined;
  if (parsed.data.mode === "student") {
    const testStatusService = await getTestStatusService();
    const questionService = await getQuestionService();
    const questions = await questionService.listQuestions(parsed.data.testId);
    for (const id of after) {
      const status = await testStatusService.getStatus(
        parsed.data.testId,
        id,
        questions.length,
      );
      if (status === TestStatus.Submitted) {
        nextStudentId = id;
        break;
      }
    }
  } else {
    for (const id of after) {
      const grade = await gradeService.getGrade(
        parsed.data.testId,
        parsed.data.questionId,
        id,
      );
      if (!grade) {
        nextStudentId = id;
        break;
      }
    }
  }

  const params = new URLSearchParams();
  if (parsed.data.mode === "question") {
    params.set("mode", "question");
    params.set("questionId", parsed.data.questionId);
  }
  if (nextStudentId) params.set("studentId", nextStudentId);
  else params.set("studentId", parsed.data.currentStudentId);
  if (parsed.data.sort) params.set("sort", parsed.data.sort);

  const qs = params.toString();
  redirect(
    qs.length > 0 ? `${parsed.data.returnPath}?${qs}` : parsed.data.returnPath,
  );
}
