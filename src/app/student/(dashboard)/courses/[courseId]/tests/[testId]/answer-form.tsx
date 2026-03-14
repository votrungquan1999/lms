"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Textarea } from "src/components/ui/textarea";
import { type SubmitAnswerState, submitAnswerAction } from "./actions";

interface AnswerFormProps {
  testId: string;
  courseId: string;
  questionId: string;
  existingAnswer: string;
}

export function AnswerForm({
  testId,
  courseId,
  questionId,
  existingAnswer,
}: AnswerFormProps) {
  const [isEditing, setIsEditing] = useState(!existingAnswer);
  const [state, formAction, isPending] = useActionState<
    SubmitAnswerState | null,
    FormData
  >(async (prevState, formData) => {
    const result = await submitAnswerAction(prevState, formData);
    if (result.success) {
      setIsEditing(false);
    }
    return result;
  }, null);

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/50 p-3">
          <p className="whitespace-pre-wrap text-sm">{existingAnswer}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
          Edit Answer
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="questionId" value={questionId} />

      <Textarea
        name="answer"
        placeholder="Type your answer here..."
        defaultValue={existingAnswer}
        rows={5}
        className="resize-y"
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit Answer"}
        </Button>

        {existingAnswer && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        )}

        {state?.message && (
          <p
            className={`text-sm ${state.success ? "text-green-600" : "text-destructive"}`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
