"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import type { Test } from "src/lib/test-service";
import { TestStatus } from "src/lib/test-status-service";
import type { TestSubmissionActive } from "src/lib/test-submission-service";
import {
  type ReleaseGradeForStudentState,
  releaseGradeForStudentAction,
} from "./actions";

interface ReleaseGradeForStudentControlProps {
  test: Test;
  courseId: string;
  studentId: string;
  submission: TestSubmissionActive | null;
  status: TestStatus;
}

/**
 * Per-student release control on the admin grading page. Renders one of:
 *   - Nothing — when the global flag / global release is open, or the student
 *     has no active submission yet (NotStarted), or the test isn't fully
 *     graded yet (so a per-student release would be premature).
 *   - "Released to this student at <date>" muted text — once the per-student
 *     release has been stamped (either on a prior page load or just now via
 *     this action).
 *   - "Release Grade to Student" button — the eligible state for the action.
 */
export function ReleaseGradeForStudentControl({
  test,
  courseId,
  studentId,
  submission,
  status,
}: ReleaseGradeForStudentControlProps) {
  const [state, formAction, isPending] = useActionState<
    ReleaseGradeForStudentState | null,
    FormData
  >(releaseGradeForStudentAction, null);

  const persistedReleasedAt = submission?.releasedAt ?? null;
  const postActionReleasedAt =
    state?.success && state.releasedAt ? new Date(state.releasedAt) : null;
  const releasedAt = postActionReleasedAt ?? persistedReleasedAt;

  if (releasedAt) {
    return (
      <p className="text-xs text-muted-foreground">
        Released to this student at {releasedAt.toLocaleDateString("en-US")}
      </p>
    );
  }

  // Global release means the per-student tier is moot.
  if (test.showGradeAfterSubmit || test.gradesReleasedAt) return null;
  // No active submission (NotStarted) or test not fully graded yet — nothing
  // to release.
  if (!submission) return null;
  if (status !== TestStatus.Graded) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="testId" value={test.id} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="studentId" value={studentId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Releasing…" : "Release Grade to Student"}
      </Button>
      {state?.message && !state.success && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
    </form>
  );
}
