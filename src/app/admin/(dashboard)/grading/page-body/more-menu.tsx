"use client";

import {
  startTransition,
  useActionState,
  useState,
  useTransition,
} from "react";
import { releaseTestAction } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/actions";
import {
  type AutoGradeSubmissionState,
  autoGradeSubmissionAction,
} from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/ai-grade-actions";
import { RegenerateWithAiDialog } from "src/app/admin/(dashboard)/courses/[courseId]/tests/[testId]/grading/regenerate-with-ai-dialog";
import { ReleaseMode } from "src/app/admin/(dashboard)/grading/page-body/grading-page-body.type";
import { RequestRedoDialog } from "src/app/admin/(dashboard)/grading/page-body/request-redo-dialog";
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
  /** The student's name and whether her grade is already released to her alone; absent when it cannot be offered. */
  releaseTo?: { studentName: string; released: boolean };
  /** The test and student the redo dialog names; absent when a redo cannot be requested. */
  requestRedo?: {
    testTitle: string;
    student: { name: string; username: string };
    submittedAt: Date | null;
  };
}

/** The "More" menu of the grade panel: the student-level actions that are not the grade itself. */
export function MoreMenu({
  testId,
  courseId,
  studentId,
  offerAutoGrade,
  offerRegenerateAll,
  aiGradingStartedAt,
  releaseTo,
  requestRedo,
}: MoreMenuProps) {
  const [redoOpen, setRedoOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [releasedNow, setReleasedNow] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releasing, startRelease] = useTransition();
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

  function releaseGrade() {
    const form = new FormData();
    form.set("testId", testId);
    form.set("courseId", courseId);
    form.set("mode", ReleaseMode.Chosen);
    form.append("studentId", studentId);
    setReleaseError(null);
    startRelease(async () => {
      const result = await releaseTestAction(null, form);
      if (result.success) setReleasedNow(true);
      else setReleaseError(result.message);
    });
  }

  const released = releaseTo?.released === true || releasedNow;

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
          {releaseTo &&
            (released ? (
              <DropdownMenuItem disabled>
                Released to {releaseTo.studentName}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={releasing} onSelect={releaseGrade}>
                <span className="flex flex-col">
                  Release to {releaseTo.studentName}
                  <span className="text-xs text-muted-foreground">
                    Only {releaseTo.studentName} sees this grade now
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          {requestRedo && (
            <DropdownMenuItem onSelect={() => setRedoOpen(true)}>
              Request redo…
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
      {requestRedo && (
        <RequestRedoDialog
          testId={testId}
          courseId={courseId}
          testTitle={requestRedo.testTitle}
          student={{ id: studentId, ...requestRedo.student }}
          submittedAt={requestRedo.submittedAt}
          open={redoOpen}
          onOpenChange={setRedoOpen}
        />
      )}
      {releaseError && (
        <p className="text-xs text-destructive">{releaseError}</p>
      )}
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
