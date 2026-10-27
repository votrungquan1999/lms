"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "src/components/ui/alert-dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";

/**
 * The REPLACE confirmation: says what the import deletes and adds, what
 * happens to students who already answered, and — only when some have —
 * that a new test keeps existing scores. The teacher must TYPE "override" —
 * a click alone is not enough, the friction is the point.
 * `AlertDialogAction` auto-closes on click (it wraps Radix's `Dialog.Close`),
 * so `handleConfirm` below calls `preventDefault()` before awaiting the
 * import — without it the dialog closes before `isPending` ever renders.
 */
export function ReplaceConfirmDialog({
  open,
  onOpenChange,
  existingQuestionCount,
  reviewedCount,
  answeredStudentCount,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingQuestionCount: number;
  /** How many reviewed questions the import adds. */
  reviewedCount: number;
  answeredStudentCount: number;
  isPending: boolean;
  onConfirm: () => Promise<void>;
}): React.ReactNode {
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim().toLowerCase() === "override";
  const reviewedPhrase = `${reviewedCount} reviewed question${reviewedCount === 1 ? "" : "s"}`;

  async function handleConfirm(
    event: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> {
    event.preventDefault();
    await onConfirm();
    setConfirmText("");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirmText("");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Replace this test&rsquo;s questions?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {existingQuestionCount > 0
                  ? `This deletes the test's ${existingQuestionCount} question${existingQuestionCount === 1 ? "" : "s"} and adds the ${reviewedPhrase}.`
                  : `This adds the ${reviewedPhrase}.`}
              </p>
              {answeredStudentCount > 0 && (
                <p>
                  At least {answeredStudentCount} student
                  {answeredStudentCount === 1 ? "" : "s"} already answered:
                  their answers to the old questions won&rsquo;t count, their
                  scores show 0% until the new questions are graded, and some
                  may show as In Progress again. To keep existing scores, create
                  a new test instead.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1">
          <Label htmlFor="replace-confirm-text">
            Type &ldquo;override&rdquo; to confirm
          </Label>
          <Input
            id="replace-confirm-text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Replacing…" : "Yes, replace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
