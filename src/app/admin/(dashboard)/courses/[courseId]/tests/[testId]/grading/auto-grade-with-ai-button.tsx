"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { TestStatus } from "src/lib/test-status-service";
import {
  type AutoGradeSubmissionState,
  autoGradeSubmissionAction,
} from "./ai-grade-actions";
import { RegenerateWithAiDialog } from "./regenerate-with-ai-dialog";

interface AutoGradeWithAiButtonProps {
  testId: string;
  courseId: string;
  studentId: string;
  status: TestStatus;
  hasExistingSuggestions: boolean;
}

/**
 * Per-student AI-grading trigger on the admin grading page.
 *
 * Morphs based on whether suggestions already exist for `(testId, studentId)`:
 *
 * - `hasExistingSuggestions === false`: renders the inline "Auto-grade with
 *   AI" form that posts directly to `autoGradeSubmissionAction`.
 * - `hasExistingSuggestions === true`: renders the "Regenerate" dialog
 *   trigger (`<RegenerateWithAiDialog>`), which opens a Dialog with a
 *   required reason `<Textarea>` and posts to `regenerateSubmissionAction`.
 *
 * Visibility: rendered only when the submission is in the Submitted state.
 * For NotStarted, InProgress, and Graded the component returns null. The
 * visibility check is duplicated in the parent server component
 * (`grading-page-body.tsx`) so the client bundle isn't shipped for
 * ineligible rows; this self-guard is defense in depth.
 */
export function AutoGradeWithAiButton({
  testId,
  courseId,
  studentId,
  status,
  hasExistingSuggestions,
}: AutoGradeWithAiButtonProps) {
  const [state, formAction, isPending] = useActionState<
    AutoGradeSubmissionState | null,
    FormData
  >(autoGradeSubmissionAction, null);

  if (status !== TestStatus.Submitted) return null;

  if (hasExistingSuggestions) {
    return (
      <RegenerateWithAiDialog
        testId={testId}
        courseId={courseId}
        studentId={studentId}
      />
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Auto-grading…" : "Auto-grade with AI"}
      </Button>
      {state?.message && (
        <p
          className={`text-sm ${
            state.success ? "text-green-600" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
