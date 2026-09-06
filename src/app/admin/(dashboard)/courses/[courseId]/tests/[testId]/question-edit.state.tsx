"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "src/components/ui/radio-group";
import type { FreeTextQuestion } from "src/lib/question-service";
import { updateQuestionAction } from "./actions";

interface QuestionEditPanelProps {
  question: FreeTextQuestion;
  courseId: string;
}

/**
 * Inline per-question edit panel, following `TestSettingsPanel`'s shape.
 * Renders only for free_text questions (D8) — the only type this batch's
 * fields apply to. Grows with Steps 20/26-28 as more fields become editable.
 */
export function QuestionEditPanel({
  question,
  courseId,
}: QuestionEditPanelProps) {
  const [state, formAction, isPending] = useActionState(
    updateQuestionAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3 border-t pt-3">
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="testId" value={question.testId} />
      <input type="hidden" name="courseId" value={courseId} />

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
            <RadioGroupItem value="diff" id={`reveal-diff-${question.id}`} />
            <Label htmlFor={`reveal-diff-${question.id}`}>
              Show side-by-side for this question
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="plain" id={`reveal-plain-${question.id}`} />
            <Label htmlFor={`reveal-plain-${question.id}`}>
              Show the answer plainly for this question
            </Label>
          </div>
        </RadioGroup>
      </div>

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
    </form>
  );
}
