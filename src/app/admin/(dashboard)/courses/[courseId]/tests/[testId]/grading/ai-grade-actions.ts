"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuthService } from "src/lib/auth-singleton";
import { getAiGradeService } from "src/lib/services-singleton";
import { z } from "zod";

const autoGradeSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
});

export interface AutoGradeSubmissionState {
  success: boolean;
  message: string;
}

/**
 * Server action: kicks off the initial AI auto-grade pass for a single
 * student's submission. Refuses with a Regenerate-pointing message if any
 * suggestion already exists for `(testId, studentId)` — that path must go
 * through Regenerate (Step 5). All revalidations are admin-only because
 * suggestions are admin-side until Apply (Step 6) promotes them.
 *
 * Returns state via the `useActionState` contract; never throws. The auth
 * boundary and an outer error boundary are the only catch sites.
 */
export async function autoGradeSubmissionAction(
  _prevState: AutoGradeSubmissionState | null,
  formData: FormData,
): Promise<AutoGradeSubmissionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = autoGradeSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const aiGradeService = await getAiGradeService();

    const alreadyExists = await aiGradeService.hasAnySuggestionsForStudent(
      parsed.data.testId,
      parsed.data.studentId,
    );

    if (alreadyExists) {
      return {
        success: false,
        message:
          "Suggestions already exist for this submission. Use Regenerate to create a new round.",
      };
    }

    await aiGradeService.generateForStudent(
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

    return { success: true, message: "AI suggestions generated" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: "AI grading failed. Please try again.",
    };
  }
}

const regenerateSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required").max(500),
});

export interface RegenerateSubmissionState {
  success: boolean;
  message: string;
}

/**
 * Server action: regenerates AI suggestions for a single student's
 * submission. Requires a non-empty trimmed reason (Zod-enforced, capped at
 * 500 chars). Delegates to `AiGradeService.regenerateForStudent`, which
 * appends NEW rows to `ai_grade` without mutating prior history. Revalidates
 * admin paths only — suggestions stay admin-side until Apply (Step 6)
 * promotes them.
 *
 * Returns state via the `useActionState` contract; never throws.
 */
export async function regenerateSubmissionAction(
  _prevState: RegenerateSubmissionState | null,
  formData: FormData,
): Promise<RegenerateSubmissionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = regenerateSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const aiGradeService = await getAiGradeService();
    await aiGradeService.regenerateForStudent(
      parsed.data.testId,
      parsed.data.studentId,
      adminUserId,
      parsed.data.reason,
    );

    revalidatePath(
      `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
    );
    revalidatePath("/admin/grading");
    revalidatePath(`/admin/grading/${parsed.data.testId}`);
    revalidatePath("/admin/dashboard");

    return { success: true, message: "AI suggestions regenerated" };
  } catch (error) {
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return {
      success: false,
      message: "AI grading failed. Please try again.",
    };
  }
}

const applyAiSuggestionSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  suggestionId: z.string().min(1),
  scoreOverride: z.coerce.number().int().min(0).max(100).optional(),
  feedbackOverride: z.string().optional(),
  solutionOverride: z.string().optional(),
});

export interface ApplyAiSuggestionState {
  success: boolean;
  message: string;
}

/**
 * Server action: promotes an AI suggestion to the official grade for a single
 * question. Score/feedback overrides are honored via `??` semantics inside the
 * service so `0` and `""` are valid intentional edits. Revalidates all five
 * paths because Apply writes to the `grade` collection that the student-facing
 * test page reads (subject to visibility flags).
 *
 * Refuses if a teacher has already manually graded the question — the service
 * throws the pinned message, the outer try/catch surfaces it via the action's
 * state. Never throws to the caller.
 */
export async function applyAiSuggestionAction(
  _prevState: ApplyAiSuggestionState | null,
  formData: FormData,
): Promise<ApplyAiSuggestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const rawScoreOverride = formData.get("scoreOverride");
  const rawFeedbackOverride = formData.get("feedbackOverride");
  const rawSolutionOverride = formData.get("solutionOverride");

  const parsed = applyAiSuggestionSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    suggestionId: formData.get("suggestionId"),
    scoreOverride:
      rawScoreOverride === null || rawScoreOverride === ""
        ? undefined
        : rawScoreOverride,
    feedbackOverride:
      rawFeedbackOverride === null ? undefined : rawFeedbackOverride,
    solutionOverride:
      rawSolutionOverride === null ? undefined : rawSolutionOverride,
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    const aiGradeService = await getAiGradeService();
    await aiGradeService.applySuggestion(
      parsed.data.suggestionId,
      adminUserId,
      {
        scoreOverride: parsed.data.scoreOverride,
        feedbackOverride: parsed.data.feedbackOverride,
        solutionOverride: parsed.data.solutionOverride,
      },
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
      message: "Suggestion applied as the official grade.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI grading failed. Please try again.";
    console.error(error instanceof Error ? error.stack : JSON.stringify(error));
    return { success: false, message };
  }
}
