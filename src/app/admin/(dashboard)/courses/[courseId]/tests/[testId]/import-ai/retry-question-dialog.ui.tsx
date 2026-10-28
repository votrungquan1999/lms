"use client";

import { useRef, useState } from "react";
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
import type { ImportQuestionDraft } from "./import-ai-draft";
import { useImportAi } from "./import-ai-form.state";

/**
 * Per-question "Retry with AI" trigger + Dialog. Sends the correction note
 * plus the current draft and the full document text; only this question's
 * card is affected. If the draft has been hand-edited since its last AI
 * result, retrying requires an explicit second confirmation before it
 * discards that edit.
 */
export function RetryQuestionDialog({
  question,
}: {
  question: ImportQuestionDraft;
}): React.ReactNode {
  const { retryOneQuestion, cancelRetry, isBusy, retryingIds } = useImportAi();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [confirmedDiscard, setConfirmedDiscard] = useState(false);
  // Counts this dialog's retries, so a cancelled one cannot close a later dialog.
  const attempt = useRef(0);
  const isPending = retryingIds.includes(question.id);

  const needsDiscardConfirmation = question.edited && !confirmedDiscard;
  const noteId = `retry-question-note-${question.id}`;

  async function handleRetry(): Promise<void> {
    attempt.current += 1;
    const mine = attempt.current;
    await retryOneQuestion(question.id, note);
    if (attempt.current !== mine) return;
    setOpen(false);
    setNote("");
    setConfirmedDiscard(false);
  }

  function handleCancel(): void {
    attempt.current += 1;
    cancelRetry(question.id);
    setOpen(false);
    setNote("");
    setConfirmedDiscard(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing a dialog with a retry running gives that retry up.
        if (!next && isPending) {
          handleCancel();
          return;
        }
        setOpen(next);
        if (!next) setConfirmedDiscard(false);
      }}
    >
      <DialogTrigger asChild>
        {/* Locked while a read or import runs: an import uploads this draft's pictures, and a retry can change them. */}
        <Button type="button" variant="secondary" size="sm" disabled={isBusy}>
          Retry with AI
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask the AI to read this question again</DialogTitle>
          <DialogDescription>
            Explain what was wrong. Only this question changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={noteId}>What was wrong?</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {needsDiscardConfirmation ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              This question has been hand-edited. Retrying will discard those
              changes.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmedDiscard(true)}
            >
              Discard my edit and retry anyway
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={isPending || note.trim().length === 0}
            onClick={handleRetry}
          >
            {isPending ? "Retrying…" : "Retry"}
          </Button>
        )}
        {isPending && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
          >
            Cancel retry
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
