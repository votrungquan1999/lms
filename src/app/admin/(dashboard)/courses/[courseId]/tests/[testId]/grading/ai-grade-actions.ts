"use server";

import type { Span } from "@opentelemetry/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  AiGradeOutcome,
  recordAiAcceptance,
} from "src/lib/ai/ai-acceptance-telemetry";
import { AiGradeJobTrigger } from "src/lib/ai-grade-job-service";
import {
  type StartRoundOutcome,
  StartRoundOutcomeKind,
} from "src/lib/ai-grade-types";
import { getAuthService } from "src/lib/auth-singleton";
import { logError } from "src/lib/observability/log-error";
import { withSpan } from "src/lib/observability/with-span";
import {
  getAiGradeJobService,
  getAiGradeService,
} from "src/lib/services-singleton";
import { z } from "zod";
import { assertGradingTarget } from "../test-parent-check";

const AI_GRADING_ALREADY_PENDING_MESSAGE =
  "AI grading is already in progress for this submission.";
const AI_GRADING_STARTED_MESSAGE =
  "AI grading started. Suggestions will appear here when it finishes.";

/**
 * Records on the action's span which path graded the round.
 * @param span - The action's span.
 * @param outcome - What the service returned.
 */
function annotateRound(span: Span, outcome: StartRoundOutcome): void {
  if (outcome.kind === StartRoundOutcomeKind.Queued) {
    span.setAttribute("lms.ai.runner_job_id", outcome.job.runnerJobId);
    span.setAttribute("lms.ai.grading_path", "runner");
  } else if (outcome.kind === StartRoundOutcomeKind.Completed) {
    span.setAttribute(
      "lms.ai.grading_path",
      outcome.fallbackCause ? "gemini_fallback" : "gemini",
    );
  }
}

/**
 * Revalidates the admin pages that show a student's AI suggestions.
 * @param courseId - The course the grading page sits under.
 * @param testId - The graded test.
 */
function revalidateGradingPaths(courseId: string, testId: string): void {
  revalidatePath(`/admin/courses/${courseId}/tests/${testId}/grading`);
  revalidatePath("/admin/grading");
  revalidatePath(`/admin/grading/${testId}`);
}

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
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
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
    return await withSpan(
      "action.autoGradeSubmissionAction",
      {
        "lms.action.name": "autoGradeSubmissionAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async (span) => {
        await assertGradingTarget(schoolId, parsed.data);

        const aiGradeService = await getAiGradeService(schoolId);

        // Before the suggestions check: a stale Auto-grade click while a regenerate job
        // runs would otherwise be told suggestions exist instead of that grading is running.
        if (
          await (await getAiGradeJobService(schoolId)).hasPendingForStudent(
            parsed.data.testId,
            parsed.data.studentId,
          )
        ) {
          return {
            success: false,
            message: AI_GRADING_ALREADY_PENDING_MESSAGE,
          };
        }

        const alreadyExists = await aiGradeService.hasAnySuggestionsForStudent(
          parsed.data.testId,
          parsed.data.studentId,
        );

        if (alreadyExists) {
          return {
            success: false,
            message:
              "Suggestions already exist for this submission. Use Regenerate all to create a new round.",
          };
        }

        const outcome = await aiGradeService.startRound({
          trigger: AiGradeJobTrigger.AutoGrade,
          testId: parsed.data.testId,
          courseId: parsed.data.courseId,
          studentId: parsed.data.studentId,
          reason: null,
          includeGraded: false,
          byAdminId: adminUserId,
        });
        annotateRound(span, outcome);
        if (outcome.kind === StartRoundOutcomeKind.AlreadyPending) {
          return {
            success: false,
            message: AI_GRADING_ALREADY_PENDING_MESSAGE,
          };
        }

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId);

        return outcome.kind === StartRoundOutcomeKind.Queued
          ? { success: true, message: AI_GRADING_STARTED_MESSAGE }
          : { success: true, message: "AI suggestions generated" };
      },
    );
  } catch (error) {
    logError(error);
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
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason must be at most 500 characters"),
  // A ticked checkbox submits "on"; an unticked one is absent from the form.
  includeGraded: z
    .literal("on")
    .nullable()
    .transform((v) => v === "on"),
});

export interface RegenerateSubmissionState {
  success: boolean;
  message: string;
}

/**
 * Server action: regenerates AI suggestions for a single student's
 * submission. Requires a trimmed reason of 3 to 500 characters (Zod-enforced).
 * Delegates to `AiGradeService.startRound`: with a runner the round
 * becomes a pending job, otherwise new `ai_grade` rows are appended on the spot
 * without mutating prior history. Teacher-graded
 * questions are included only when the `includeGraded` checkbox is ticked.
 * Revalidates admin paths only — suggestions stay admin-side until Apply
 * (Step 6) promotes them. A round that regenerates nothing returns
 * `success: false` with the reason.
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
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = regenerateSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    reason: formData.get("reason"),
    includeGraded: formData.get("includeGraded"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.regenerateSubmissionAction",
      {
        "lms.action.name": "regenerateSubmissionAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async (span) => {
        await assertGradingTarget(schoolId, parsed.data);

        const aiGradeService = await getAiGradeService(schoolId);
        const outcome = await aiGradeService.startRound({
          trigger: AiGradeJobTrigger.RegenerateAll,
          testId: parsed.data.testId,
          courseId: parsed.data.courseId,
          studentId: parsed.data.studentId,
          reason: parsed.data.reason,
          includeGraded: parsed.data.includeGraded,
          byAdminId: adminUserId,
        });
        annotateRound(span, outcome);
        if (outcome.kind === StartRoundOutcomeKind.AlreadyPending) {
          return {
            success: false,
            message: AI_GRADING_ALREADY_PENDING_MESSAGE,
          };
        }
        // An empty round means nothing was in scope; say why instead of claiming success.
        if (outcome.kind === StartRoundOutcomeKind.NothingToGrade) {
          return {
            success: false,
            message: parsed.data.includeGraded
              ? "This student has no written answers to regenerate."
              : "Every question already has your grade. Tick the box to regenerate them anyway.",
          };
        }

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId);

        return outcome.kind === StartRoundOutcomeKind.Queued
          ? { success: true, message: AI_GRADING_STARTED_MESSAGE }
          : { success: true, message: "AI suggestions regenerated" };
      },
    );
  } catch (error) {
    logError(error);
    return {
      success: false,
      message: "AI grading failed. Please try again.",
    };
  }
}

const regenerateQuestionSchema = z.object({
  testId: z.string().min(1),
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  questionId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters")
    .max(500, "Reason must be at most 500 characters"),
});

export interface RegenerateQuestionState {
  success: boolean;
  message: string;
}

/**
 * Server action: regenerates the AI suggestion for a SINGLE question of one
 * student's submission. Requires a trimmed reason of 3 to 500 characters
 * (Zod-enforced). Delegates to `AiGradeService.startRound` scoped to that
 * question: a runner job, or one new `ai_grade` row on the spot. Revalidates
 * admin paths only — suggestions stay admin-side until Apply promotes them.
 *
 * Returns state via the `useActionState` contract; never throws.
 */
export async function regenerateQuestionAction(
  _prevState: RegenerateQuestionState | null,
  formData: FormData,
): Promise<RegenerateQuestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
  } catch {
    return { success: false, message: "Unauthorized: admin access required" };
  }

  const parsed = regenerateQuestionSchema.safeParse({
    testId: formData.get("testId"),
    courseId: formData.get("courseId"),
    studentId: formData.get("studentId"),
    questionId: formData.get("questionId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.regenerateQuestionAction",
      {
        "lms.action.name": "regenerateQuestionAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
        "lms.question.id": parsed.data.questionId,
      },
      async (span) => {
        await assertGradingTarget(schoolId, parsed.data);

        const aiGradeService = await getAiGradeService(schoolId);
        const outcome = await aiGradeService.startRound({
          trigger: AiGradeJobTrigger.RegenerateQuestion,
          testId: parsed.data.testId,
          courseId: parsed.data.courseId,
          studentId: parsed.data.studentId,
          questionId: parsed.data.questionId,
          reason: parsed.data.reason,
          includeGraded: true,
          byAdminId: adminUserId,
        });
        annotateRound(span, outcome);
        if (outcome.kind === StartRoundOutcomeKind.AlreadyPending) {
          return {
            success: false,
            message: AI_GRADING_ALREADY_PENDING_MESSAGE,
          };
        }
        if (outcome.kind === StartRoundOutcomeKind.NothingToGrade) {
          return {
            success: false,
            message: "This answer has no written text to regenerate.",
          };
        }

        revalidateGradingPaths(parsed.data.courseId, parsed.data.testId);

        return outcome.kind === StartRoundOutcomeKind.Queued
          ? { success: true, message: AI_GRADING_STARTED_MESSAGE }
          : { success: true, message: "AI suggestions regenerated" };
      },
    );
  } catch (error) {
    logError(error);
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
  replace: z.boolean(),
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
 * Refuses to replace the teacher's own grade unless the form carries
 * `replace=true` (set after the teacher confirms) — the service throws the
 * pinned message, the outer try/catch surfaces it via the action's state. Never throws to the caller.
 */
export async function applyAiSuggestionAction(
  _prevState: ApplyAiSuggestionState | null,
  formData: FormData,
): Promise<ApplyAiSuggestionState> {
  const requestHeaders = await headers();
  const authService = await getAuthService();

  let adminUserId: string;
  let schoolId: string;
  try {
    const session = await authService.requireAdminSession(requestHeaders);
    adminUserId = session.userId;
    schoolId = session.school.id;
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
    replace: formData.get("replace") === "true",
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }

  try {
    return await withSpan(
      "action.applyAiSuggestionAction",
      {
        "lms.action.name": "applyAiSuggestionAction",
        "lms.test.id": parsed.data.testId,
        "lms.course.id": parsed.data.courseId,
        "lms.student.id": parsed.data.studentId,
      },
      async (span) => {
        await assertGradingTarget(schoolId, parsed.data);

        const aiGradeService = await getAiGradeService(schoolId);
        const suggestion = await aiGradeService.applySuggestion(
          parsed.data.suggestionId,
          adminUserId,
          { testId: parsed.data.testId, studentId: parsed.data.studentId },
          {
            scoreOverride: parsed.data.scoreOverride,
            feedbackOverride: parsed.data.feedbackOverride,
            solutionOverride: parsed.data.solutionOverride,
          },
          { replace: parsed.data.replace },
        );
        // Mirrors apply-suggestion's `??` resolution of the overrides.
        recordAiAcceptance(span, AiGradeOutcome.Applied, suggestion, {
          score: parsed.data.scoreOverride ?? suggestion.score,
          feedback: parsed.data.feedbackOverride ?? suggestion.feedback,
          solution: parsed.data.solutionOverride ?? suggestion.solution,
        });

        revalidatePath(
          `/admin/courses/${parsed.data.courseId}/tests/${parsed.data.testId}/grading`,
        );
        revalidatePath("/admin/grading");
        revalidatePath(`/admin/grading/${parsed.data.testId}`);
        revalidatePath(
          `/student/courses/${parsed.data.courseId}/tests/${parsed.data.testId}`,
        );

        return {
          success: true,
          message: "Suggestion applied as the official grade.",
        };
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI grading failed. Please try again.";
    logError(error);
    return { success: false, message };
  }
}
