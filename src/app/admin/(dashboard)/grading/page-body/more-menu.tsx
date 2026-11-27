"use client";

import { startTransition, useActionState } from "react";
import {
  type AutoGradeSubmissionState,
  autoGradeSubmissionAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grade-actions";
import { Button } from "src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";

interface MoreMenuProps {
  testId: string;
  courseId: string;
  studentId: string;
  /** The student has no AI suggestions yet, so the first round is offered. */
  offerAutoGrade: boolean;
  /** When the student's pending AI grading job started; null when none is pending. Locks the AI entries. */
  aiGradingStartedAt: Date | null;
}

/** The "More" menu of the grade panel: the student-level actions that are not the grade itself. */
export function MoreMenu({
  testId,
  courseId,
  studentId,
  offerAutoGrade,
  aiGradingStartedAt,
}: MoreMenuProps) {
  const [state, formAction] = useActionState<
    AutoGradeSubmissionState | null,
    FormData
  >(autoGradeSubmissionAction, null);

  function autoGrade() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    form.set("studentId", studentId);
    startTransition(() => formAction(form));
  }

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            More ▾
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          {offerAutoGrade && (
            <DropdownMenuItem
              disabled={aiGradingStartedAt !== null}
              onSelect={autoGrade}
            >
              Auto-grade with AI
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {state?.message && (
        <p
          className={`text-xs ${
            state.success ? "text-green-600" : "text-destructive"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
