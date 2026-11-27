"use client";

import type { FormEvent } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";

/** How the test's students stand, for the dialog's summary line. */
export interface ReleaseStudentCounts {
  graded: number;
  waiting: number;
  stillWriting: number;
  redoRequested: number;
  notStarted: number;
}

/** "2 graded · 1 waiting · 0 still writing · 2 not started", with the redo part only when there is one. */
export function releaseSummary(counts: ReleaseStudentCounts): string {
  return [
    `${counts.graded} graded`,
    `${counts.waiting} waiting`,
    `${counts.stillWriting} still writing`,
    ...(counts.redoRequested > 0
      ? [`${counts.redoRequested} redo requested`]
      : []),
    `${counts.notStarted} not started`,
  ].join(" · ");
}

interface ReleaseDialogViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testTitle: string;
  counts: ReleaseStudentCounts;
  /** False when students already see the correct answers: the tick is left out. */
  offerCorrectAnswers: boolean;
  /** Single and multiple choice questions, the ones whose right option students see. */
  choiceQuestionCount: number;
  alsoCorrectAnswers: boolean;
  onAlsoCorrectAnswersChange: (checked: boolean) => void;
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
}

/** Who sees their grades, and whether the correct answers come with them. */
export function ReleaseDialogView({
  open,
  onOpenChange,
  testTitle,
  counts,
  offerCorrectAnswers,
  choiceQuestionCount,
  alsoCorrectAnswers,
  onAlsoCorrectAnswersChange,
  pending,
  error,
  onSubmit,
}: ReleaseDialogViewProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release grades · {testTitle}</DialogTitle>
          <DialogDescription>{releaseSummary(counts)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Who sees their grade</p>
            <RadioGroup value="whole" aria-label="Who sees their grade">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="whole" id="release-whole" />
                <Label htmlFor="release-whole" className="grid gap-0.5">
                  <span>Whole test</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Every student sees their grade once it's graded, also
                    students graded later.
                  </span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {offerCorrectAnswers && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="release-correct-answers"
                checked={alsoCorrectAnswers}
                onCheckedChange={(checked) =>
                  onAlsoCorrectAnswersChange(checked === true)
                }
              />
              <Label htmlFor="release-correct-answers" className="grid gap-0.5">
                <span>Also show correct answers</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {choiceQuestionCount > 0
                    ? `Students see the right option on the ${choiceQuestionCount} single and multiple choice questions. `
                    : ""}
                  This is a separate release for the whole test.
                </span>
              </Label>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Edits after release show to students right away.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Releasing…" : "Release"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
