"use client";

import { startTransition, useActionState, useState } from "react";
import {
  type AutoGradeSubmissionState,
  autoGradeSubmissionAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grade-actions";
import { RegenerateWithAiDialog } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/regenerate-with-ai-dialog";
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
  /** The student already has AI suggestions, so a new round over the whole submission is offered. */
  offerRegenerateAll: boolean;
  /** When the student's pending AI grading job started; null when none is pending. Locks the AI entries. */
  aiGradingStartedAt: Date | null;
}

/** The "More" menu of the grade panel: the student-level actions that are not the grade itself. */
export function MoreMenu({
  testId,
  courseId,
  studentId,
  offerAutoGrade,
  offerRegenerateAll,
  aiGradingStartedAt,
}: MoreMenuProps) {
  const [regenerateOpen, setRegenerateOpen] = useState(false);
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
          {offerRegenerateAll && (
            <DropdownMenuItem
              disabled={aiGradingStartedAt !== null}
              onSelect={() => setRegenerateOpen(true)}
            >
              Regenerate all with AI…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Beside the menu, not inside an item, so it outlives the menu closing. */}
      <RegenerateWithAiDialog
        testId={testId}
        courseId={courseId}
        studentId={studentId}
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        disabled={aiGradingStartedAt !== null}
      />
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
