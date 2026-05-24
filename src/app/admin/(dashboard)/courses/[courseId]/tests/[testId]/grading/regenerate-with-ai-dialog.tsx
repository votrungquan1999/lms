"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
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
}: RegenerateWithAiDialogProps) {
  const [open, setOpen] = useState(false);

  const [state, formAction, isPending] = useActionState<
    RegenerateSubmissionState | null,
    FormData
  >(regenerateSubmissionAction, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Regenerate
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

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Regenerating…" : "Regenerate"}
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
