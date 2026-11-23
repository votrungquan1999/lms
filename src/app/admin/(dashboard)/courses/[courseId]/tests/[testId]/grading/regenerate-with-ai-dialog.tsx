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
  DialogTrigger,
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
  /** True while a grading job is pending: the trigger and the submit button stay disabled. */
  disabled?: boolean;
}

/**
 * Per-student "Regenerate" trigger + Dialog. Rendered in place of the initial
 * Auto-grade button once at least one AI suggestion already exists for the
 * submission (`hasExistingSuggestions === true` upstream).
 *
 * The Dialog hosts a single `<form>` posting to `regenerateSubmissionAction`
 * via `useActionState`. The reason `<Textarea>` is required client-side via
 * `minLength`/`maxLength` and re-validated server-side by Zod
 * (`.trim().min(1).max(500)`).
 * An unticked-by-default checkbox lets the teacher also regenerate questions
 * they already graded.
 *
 * Open/close is local `useState` (no `useEffect`). On a successful submit the
 * dialog stays open and surfaces the success message; the page revalidation
 * triggered by the server action will re-render the parent server component
 * and swap the dialog/button group with the fresh suggestion history.
 */
export function RegenerateWithAiDialog({
  testId,
  courseId,
  studentId,
  disabled = false,
}: RegenerateWithAiDialogProps) {
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<
    RegenerateSubmissionState | null,
    FormData
  >(regenerateSubmissionAction, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled}>
          Regenerate all
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate AI Suggestions</DialogTitle>
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
            <Checkbox id="regenerate-include-graded" name="includeGraded" />
            <Label htmlFor="regenerate-include-graded">
              Also regenerate questions I've already graded
            </Label>
          </div>

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
