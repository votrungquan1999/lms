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
  type RegenerateQuestionState,
  regenerateQuestionAction,
} from "./ai-grade-actions";

interface RegenerateQuestionDialogProps {
  testId: string;
  courseId: string;
  studentId: string;
  questionId: string;
}

/**
 * Per-question "Regenerate" trigger + Dialog. Scoped to a single free-text
 * question — posts to `regenerateQuestionAction` (carrying `questionId`) so a
 * teacher can get a fresh AI take on one answer without re-running the whole
 * submission. Mirrors the whole-submission `RegenerateWithAiDialog`: a required
 * reason `<Textarea>` (Zod-enforced server-side), local `useState` open/close,
 * no `useEffect`.
 */
export function RegenerateQuestionDialog({
  testId,
  courseId,
  studentId,
  questionId,
}: RegenerateQuestionDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    RegenerateQuestionState | null,
    FormData
  >(regenerateQuestionAction, null);

  const reasonId = `regenerate-question-reason-${questionId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="ai-regenerate-question-trigger"
        >
          Regenerate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate this answer's AI suggestion</DialogTitle>
          <DialogDescription>
            Explain why a fresh take is needed. Your reason is logged with the
            new suggestion for this question only.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="questionId" value={questionId} />

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason</Label>
            <Textarea
              id={reasonId}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. The AI under-credited the base-case explanation."
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
