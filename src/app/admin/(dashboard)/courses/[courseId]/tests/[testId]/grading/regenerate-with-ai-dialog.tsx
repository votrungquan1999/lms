"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import {
  type RegenerateSubmissionState,
  regenerateSubmissionAction,
} from "./ai-grade-actions";

interface RegenerateWithAiDialogProps {
  testId: string;
  courseId: string;
  studentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while a grading job is pending: the submit button stays disabled. */
  disabled?: boolean;
}

/**
 * Dialog that starts a new AI round for a student's whole submission. Its
 * trigger is the "Regenerate all with AI…" entry of the grade panel's More
 * menu, which owns the open state.
 *
 * The reason is required client-side and re-validated by the server action.
 * Questions the teacher already graded are included only when ticked.
 */
export function RegenerateWithAiDialog({
  testId,
  courseId,
  studentId,
  open,
  onOpenChange,
  disabled = false,
}: RegenerateWithAiDialogProps) {
  const [includeGraded, setIncludeGraded] = useState(false);

  const [state, formAction, isPending] = useActionState<
    RegenerateSubmissionState | null,
    FormData
  >(regenerateSubmissionAction, null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate all with AI</DialogTitle>
          <DialogDescription>
            Explain why a fresh round is needed. Your reason is logged with the
            new suggestions for traceability.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="studentId" value={studentId} />

          <div className="space-y-2">
            <Label htmlFor="regenerate-reason">Reason</Label>
            <Textarea
              id="regenerate-reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. The AI was too lenient on partial credit."
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="regenerate-include-graded"
              name="includeGraded"
              checked={includeGraded}
              onCheckedChange={(checked) => setIncludeGraded(checked === true)}
            />
            <Label htmlFor="regenerate-include-graded">
              Also regenerate questions I've already graded
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {includeGraded
              ? "On: every written answer gets a new suggestion, including ones you graded."
              : "Off: only answers you have not graded get a new suggestion."}
          </p>

          <Button
            type="submit"
            disabled={isPending || disabled}
            className="w-full"
          >
            {isPending ? "Regenerating…" : "Regenerate all"}
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
      </DialogContent>
    </Dialog>
  );
}
