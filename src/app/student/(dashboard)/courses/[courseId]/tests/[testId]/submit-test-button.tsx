"use client";

import { useActionState, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "src/components/ui/alert-dialog";
import { Button } from "src/components/ui/button";
import { type SubmitTestState, submitTestAction } from "./actions";

interface SubmitTestButtonProps {
  testId: string;
  courseId: string;
  totalQuestions: number;
  answeredQuestions: number;
}

export function SubmitTestButton({
  testId,
  courseId,
  totalQuestions,
  answeredQuestions,
}: SubmitTestButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    SubmitTestState | null,
    FormData
  >(submitTestAction, null);

  const allAnswered = answeredQuestions >= totalQuestions;

  return (
    <>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button disabled={isPending}>
            {isPending ? "Submitting..." : "Submit Test for Grading"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit test for grading?</AlertDialogTitle>
            <AlertDialogDescription>
              {allAnswered ? (
                <>
                  You have answered all {totalQuestions} question
                  {totalQuestions !== 1 ? "s" : ""}. You won't be able to edit
                  your answers after submission.
                </>
              ) : (
                <>
                  You've answered{" "}
                  <span className="font-semibold text-foreground">
                    {answeredQuestions}
                  </span>{" "}
                  out of{" "}
                  <span className="font-semibold text-foreground">
                    {totalQuestions}
                  </span>{" "}
                  question{totalQuestions !== 1 ? "s" : ""}.{" "}
                  <span className="text-yellow-600 dark:text-yellow-400">
                    {totalQuestions - answeredQuestions} question
                    {totalQuestions - answeredQuestions !== 1 ? "s" : ""}{" "}
                    unanswered.
                  </span>{" "}
                  You won't be able to edit your answers after submission.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={formAction}>
              <input type="hidden" name="testId" value={testId} />
              <input type="hidden" name="courseId" value={courseId} />
              <AlertDialogAction type="submit" disabled={isPending}>
                {isPending ? "Submitting..." : "Confirm Submission"}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {state?.message && (
        <p
          className={`text-sm ${state.success ? "text-green-600" : "text-destructive"}`}
        >
          {state.message}
        </p>
      )}
    </>
  );
}
