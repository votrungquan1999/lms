"use client";

import type * as React from "react";
import { useActionState, useRef, useState } from "react";
import { OptionalTextField } from "src/components/optional-text-field";
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
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import { isMcQuestion, type Question } from "src/lib/question-service";
import { updateQuestionAction } from "./actions";

interface QuestionEditPanelProps {
  question: Question;
  courseId: string;
  /** Distinct answered-student count for this question (Step 23) — gates the D50 confirmation. */
  answeredCount: number;
}

/**
 * Reads the panel's current (uncontrolled) field values from `formData` and
 * names which ones actually differ from `question`'s stored values — the
 * words the D50 confirmation shows. Grows with Steps 26-28 as more fields
 * become editable; only free_text/explanation fields exist in this batch.
 */
function deriveChangedFieldLabels(
  question: Question,
  formData: FormData,
): string[] {
  const labels: string[] = [];

  if (question.type === "free_text") {
    const rawReveal = formData.get("answerRevealMode")?.toString();
    const reveal = rawReveal === "inherit" ? undefined : rawReveal;
    if (reveal !== question.answerRevealMode) {
      labels.push("how the answer is shown");
    }

    const referenceAnswer =
      formData.get("referenceAnswer")?.toString().trim() || undefined;
    if (referenceAnswer !== question.referenceAnswer) {
      labels.push("the model answer");
    }
  }

  if (question.type === "free_text" || isMcQuestion(question)) {
    const explanation =
      formData.get("explanation")?.toString().trim() || undefined;
    if (explanation !== question.explanation) {
      labels.push("the explanation");
    }
  }

  return labels;
}

/**
 * Inline per-question edit panel, following `TestSettingsPanel`'s shape.
 * The reveal-mode override and model answer render only for free_text
 * questions (D8); explanation is a column shared by MC and free_text, so
 * both branches get it. Grows with Steps 26-28 as more fields become editable.
 *
 * D29/D50: when at least one student has already answered AND the save
 * would actually change something, Save opens a confirmation naming the
 * specific change instead of submitting directly. The form keeps its normal
 * `action={formAction}` — confirming calls `formRef.current.requestSubmit()`
 * (a real DOM submit, so `useActionState` sees it exactly like a direct
 * click) rather than moving the form itself inside the dialog, since the
 * dialog's content is portaled and the panel's other fields must stay
 * visible on the card behind it.
 */
export function QuestionEditPanel({
  question,
  courseId,
  answeredCount,
}: QuestionEditPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateQuestionAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingChangeLabels, setPendingChangeLabels] = useState<
    string[] | null
  >(null);
  // Confirming re-submits the same form; this ref tells handleSubmit to let
  // that resubmission through instead of re-opening the dialog.
  const bypassGateRef = useRef(false);

  const isFreeText = question.type === "free_text";

  /**
   * Gates on the form's actual submit event, not just a Save click — this is
   * also what fires when Enter is pressed inside a lone text field (HTML's
   * implicit submission), which a click-only gate would miss entirely.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (bypassGateRef.current) {
      bypassGateRef.current = false;
      return;
    }

    const changed = deriveChangedFieldLabels(
      question,
      new FormData(event.currentTarget),
    );
    if (answeredCount > 0 && changed.length > 0) {
      event.preventDefault();
      setPendingChangeLabels(changed);
    }
  }

  function handleConfirm() {
    setPendingChangeLabels(null);
    bypassGateRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className="space-y-3 border-t pt-3"
    >
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="testId" value={question.testId} />
      <input type="hidden" name="courseId" value={courseId} />

      {isFreeText && (
        <>
          <OptionalTextField
            id={`reference-answer-${question.id}`}
            name="referenceAnswer"
            label="Model Answer"
            placeholder="Write a sample correct answer…"
            defaultValue={question.referenceAnswer}
          />
          <div className="space-y-1">
            <Label>How this question shows its answer</Label>
            <RadioGroup
              name="answerRevealMode"
              defaultValue={question.answerRevealMode ?? "inherit"}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="inherit"
                  id={`reveal-inherit-${question.id}`}
                />
                <Label htmlFor={`reveal-inherit-${question.id}`}>
                  Inherit from the test
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="diff"
                  id={`reveal-diff-${question.id}`}
                />
                <Label htmlFor={`reveal-diff-${question.id}`}>
                  Show side-by-side for this question
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="plain"
                  id={`reveal-plain-${question.id}`}
                />
                <Label htmlFor={`reveal-plain-${question.id}`}>
                  Show the answer plainly for this question
                </Label>
              </div>
            </RadioGroup>
          </div>
        </>
      )}

      {(isFreeText || isMcQuestion(question)) && (
        <OptionalTextField
          id={`explanation-${question.id}`}
          name="explanation"
          label="Explanation"
          placeholder="Explain what makes a good answer…"
          defaultValue={question.explanation}
        />
      )}

      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? "Saving..." : "Save"}
      </Button>

      {state?.success && (
        <output className="block text-sm text-emerald-600">
          {state.message}
        </output>
      )}
      {state && !state.success && (
        <div className="text-sm text-destructive" role="alert">
          {state.message}
        </div>
      )}

      <AlertDialog
        open={pendingChangeLabels !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChangeLabels(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your change</AlertDialogTitle>
            <AlertDialogDescription>
              You're about to change {pendingChangeLabels?.join(", ")} on a
              question{" "}
              {answeredCount === 1
                ? "1 student has"
                : `${answeredCount} students have`}{" "}
              already answered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleConfirm}>
              {isPending ? "Saving..." : "Save anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
