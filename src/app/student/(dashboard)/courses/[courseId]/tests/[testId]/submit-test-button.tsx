"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { type SubmitTestState, submitTestAction } from "./actions";

interface SubmitTestButtonProps {
  testId: string;
  courseId: string;
}

export function SubmitTestButton({ testId, courseId }: SubmitTestButtonProps) {
  const [state, formAction, isPending] = useActionState<
    SubmitTestState | null,
    FormData
  >(submitTestAction, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="testId" value={testId} />
      <input type="hidden" name="courseId" value={courseId} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Submit Test for Grading"}
        </Button>
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
