"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthService } from "src/lib/auth-singleton";
import { withSpan } from "src/lib/observability/with-span";
import {
  getAnnotationService,
  getGradeService,
  getRedoRequestService,
  getTestFeedbackService,
  getTestService,
  getTestSubmissionService,
} from "src/lib/services-singleton";
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

const annotationPointSchema = z.object({ x: z.number(), y: z.number() });
const annotationStrokeSchema = z.object({
  color: z.string().min(1),
  points: z.array(annotationPointSchema),
});
const saveAnnotationsSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  questionId: z.string().min(1),
  studentId: z.string().min(1),
  annotations: z.array(
    z.object({
      mediaKey: z.string().min(1),
      strokes: z.array(annotationStrokeSchema),
    }),
  ),
});

export interface GradeQuestionState {
  success: boolean;
  message: string;
}

export interface SaveAnnotationsState {
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
 * Server action: saves a grader's vector annotations over a student's answer
 * photos. Admin-guarded; accepts a JSON-encoded annotation entry array.
 * @param input - Target ids and the JSON-encoded annotation entries.
 * @returns Success or a failure message.
 */
export async function saveAnnotationsAction(input: {
  testId: string;
  courseId: string;
  questionId: string;
  studentId: string;
  annotationsJson: string;
}): Promise<SaveAnnotationsState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  let rawAnnotations: unknown;
  try {
    rawAnnotations = JSON.parse(input.annotationsJson);
  } catch {
    return { success: false, message: "Invalid annotations format" };
  }

  const parsed = saveAnnotationsSchema.safeParse({
    testId: input.testId,
    courseId: input.courseId,
    questionId: input.questionId,
    studentId: input.studentId,
    annotations: rawAnnotations,
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.saveAnnotationsAction",
      {
        "lms.action.name": "saveAnnotationsAction",
        "lms.test.id": parsed.data.testId,
        "lms.student.id": parsed.data.studentId,
      },
      async () => {
        const annotationService = await getAnnotationService();
        await annotationService.saveAnnotations({
          testId: parsed.data.testId,
          questionId: parsed.data.questionId,
          studentId: parsed.data.studentId,
          gradedBy: adminUserId,
          annotations: parsed.data.annotations,
        });

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
        );
        revalidatePath(`/admin/grading/${parsed.data.testId}`);

        return { success: true, message: "Annotations saved" };
      },
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to save annotations",
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
 * Returns the items after `currentId` in list order, or the full list if
 * `currentId` isn't found (defensive fallback — shouldn't happen since the
 * caller's own id is always a member of its own candidate list).
 */
function candidatesAfter(candidates: string[], currentId: string): string[] {
  const currentIndex = candidates.indexOf(currentId);
  return currentIndex >= 0 ? candidates.slice(currentIndex + 1) : candidates;
}

/**
 * Server action: grades a question for the current student and then redirects
 * to the next item to grade.
 *
 * - Student-mode: stays on the SAME student and jumps to the next question in
 *   `candidateIds` (an ordered list of that student's form-bearing question
 *   ids) positioned after the current `questionId`. Purely positional — no
 *   DB lookups. If there is no next question, redirects back without a
 *   `#question-<id>` fragment (stop; no next-student jump).
 * - Question-mode: jumps to the next student in `candidateIds` whose grade
 *   for the active question is still missing after this save. Unchanged.
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

  let redirectTarget: string;
  if (parsed.data.mode === "student") {
    // Positional only: candidates are this student's ordered form-bearing
    // question ids, so "next" is just the id right after the current one.
    const nextQuestionId = candidatesAfter(
      candidates,
      parsed.data.questionId,
    )[0];

    const params = new URLSearchParams();
    params.set("studentId", parsed.data.studentId);
    if (parsed.data.sort) params.set("sort", parsed.data.sort);
    const base = `${parsed.data.returnPath}?${params.toString()}`;
    redirectTarget = nextQuestionId
      ? `${base}#question-${nextQuestionId}`
      : base;
  } else {
    const after = candidatesAfter(candidates, parsed.data.currentStudentId);

    let nextStudentId: string | undefined;
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

    const params = new URLSearchParams();
    params.set("mode", "question");
    params.set("questionId", parsed.data.questionId);
    params.set("studentId", nextStudentId ?? parsed.data.currentStudentId);
    if (parsed.data.sort) params.set("sort", parsed.data.sort);
    redirectTarget = `${parsed.data.returnPath}?${params.toString()}`;
  }

  redirect(redirectTarget);
}
