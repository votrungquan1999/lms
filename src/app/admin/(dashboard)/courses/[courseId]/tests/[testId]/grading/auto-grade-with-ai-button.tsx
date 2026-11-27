"use client";

import { RegenerateWithAiDialog } from "./regenerate-with-ai-dialog";

interface AutoGradeWithAiButtonProps {
  testId: string;
  courseId: string;
  studentId: string;
  /** When the submission's pending AI grading job started; null when none is pending. Disables the trigger; the page shows the note. */
  aiGradingStartedAt?: Date | null;
}

/**
 * Per-student "Regenerate all" trigger, rendered once AI suggestions exist
 * for the submission. The first round is started from the grade panel's More
 * menu.
 */
export function AutoGradeWithAiButton({
  testId,
  courseId,
  studentId,
  aiGradingStartedAt = null,
}: AutoGradeWithAiButtonProps) {
  return (
    <RegenerateWithAiDialog
      testId={testId}
      courseId={courseId}
      studentId={studentId}
      disabled={aiGradingStartedAt !== null}
    />
  );
}
