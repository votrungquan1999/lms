"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { submitWithoutReset } from "src/lib/submit-without-reset";
import { type CreateTestState, createTestAction } from "./actions";

/**
 * Client component: dialog for admins to create a test within a course.
 */
export function CreateTestDialog({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  // A closed-and-reopened dialog abandons the last attempt — its banner
  // must not resurface until the admin submits again.
  const [dismissed, setDismissed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CreateTestState | null,
    FormData
  >(async (_prevState, formData) => {
    setDismissed(false);
    const result = await createTestAction(_prevState, formData);
    if (result.success) {
      setSuccessCount((c) => c + 1);
    }
    return result;
  }, null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setDismissed(true);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Add Test</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Test</DialogTitle>
          <DialogDescription>Add a new test to this course.</DialogDescription>
        </DialogHeader>

        <form
          key={successCount}
          action={formAction}
          onSubmit={submitWithoutReset(formAction)}
          className="space-y-4"
        >
          <input type="hidden" name="courseId" value={courseId} />

          <div className="space-y-2">
            <Label htmlFor="test-title">Test Title</Label>
            <Input
              id="test-title"
              name="title"
              type="text"
              required
              placeholder="e.g. Midterm Exam"
              autoComplete="off"
              aria-invalid={
                !dismissed && state?.fieldErrors?.title ? "true" : undefined
              }
              aria-describedby={
                !dismissed && state?.fieldErrors?.title
                  ? "test-title-error"
                  : undefined
              }
            />
            {!dismissed && state?.fieldErrors?.title && (
              <p id="test-title-error" className="text-sm text-destructive">
                {state.fieldErrors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="test-description">Description</Label>
            <Textarea
              id="test-description"
              name="description"
              placeholder="Optional test description"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="show-grades-immediately"
              name="showGradeAfterSubmit"
              value="true"
              defaultChecked
            />
            <Label htmlFor="show-grades-immediately">
              Show grades immediately
            </Label>
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Test"}
          </Button>
        </form>

        {!dismissed && state?.success && (
          <output className="block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}

        {!dismissed && state && !state.success && !state.fieldErrors?.title && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
