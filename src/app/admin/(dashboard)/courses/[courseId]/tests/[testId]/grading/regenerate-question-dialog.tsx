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
  /** The suggestion this regenerate replaces; shown so the teacher knows what is being redone. */
  currentSuggestion?: { score: number; feedback: string };
  /** True while a grading job is pending: the trigger and the submit button stay disabled. */
  disabled?: boolean;
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
  currentSuggestion,
  disabled = false,
}: RegenerateQuestionDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, isPending] = useActionState<
    RegenerateQuestionState | null,
    FormData
  >(async (previous, formData) => {
    const result = await regenerateQuestionAction(previous, formData);
    // The new suggestion shows on the card, so a finished regenerate closes the dialog.
    if (result.success) {
      setOpen(false);
      setReason("");
    }
    return result;
  }, null);

  const reasonId = `regenerate-question-reason-${questionId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          data-testid="ai-regenerate-question-trigger"
        >
          Regenerate this answer
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

        {currentSuggestion && (
          <p className="text-sm">
            Current suggestion {currentSuggestion.score} —{" "}
            {currentSuggestion.feedback}
          </p>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="questionId" value={questionId} />

          <div className="space-y-2">
            <Label htmlFor={reasonId}>Reason (required)</Label>
            <Textarea
              id={reasonId}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The AI under-credited the base-case explanation."
            />
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>3–500 characters. Shown on the new suggestion.</span>
              <span>{reason.length} / 500</span>
            </p>
            <p className="text-xs text-muted-foreground">
              The current suggestion moves to View history. The grade doesn't
              change until you press Use this on the new suggestion.
            </p>
          </div>

          <Button
            type="submit"
            disabled={isPending || disabled}
            className="w-full"
          >
            {isPending ? "Regenerating…" : "Regenerate this answer"}
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
