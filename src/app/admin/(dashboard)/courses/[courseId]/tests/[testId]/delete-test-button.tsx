"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
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
import { deleteTestAction } from "./actions";

interface DeleteTestButtonProps {
  courseId: string;
  testId: string;
  iconOnly?: boolean;
}

export function DeleteTestButton({
  courseId,
  testId,
  iconOnly,
}: DeleteTestButtonProps) {
  const [state, formAction, isPending] = useActionState(deleteTestAction, null);

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {iconOnly ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="sr-only">Delete Test</span>
            </Button>
          ) : (
            <Button variant="destructive" className="gap-2">
              <Trash2 className="w-4 h-4" />
              Delete Test
            </Button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will soft-delete the test. It will no longer be
              visible to students or available for submission, but the records
              will remain for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={formAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <input type="hidden" name="testId" value={testId} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending}
                >
                  {isPending ? "Deleting..." : "Continue"}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {state && !state.success && (
        <div className="mt-2 text-sm text-destructive font-medium">
          {state.message}
        </div>
      )}
    </>
  );
}
