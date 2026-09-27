"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
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
import { type CreateCourseState, createCourseAction } from "./actions";

/**
 * Client component: dialog for admins to create a new course.
 */
export function CreateCourseDialog() {
  const [open, setOpen] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  // A closed-and-reopened dialog abandons the last attempt — its banner
  // must not resurface until the admin submits again.
  const [dismissed, setDismissed] = useState(false);
  const [state, formAction, isPending] = useActionState<
    CreateCourseState | null,
    FormData
  >(async (_prevState, formData) => {
    setDismissed(false);
    const result = await createCourseAction(_prevState, formData);
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
        <Button>Add Course</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Course</DialogTitle>
          <DialogDescription>
            Add a new course to organize lessons and tests.
          </DialogDescription>
        </DialogHeader>

        <form
          key={successCount}
          action={formAction}
          onSubmit={submitWithoutReset(formAction)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="title">Course Title</Label>
            <Input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. Introduction to Algorithms"
              autoComplete="off"
              aria-invalid={
                !dismissed && state?.fieldErrors?.title ? "true" : undefined
              }
              aria-describedby={
                !dismissed && state?.fieldErrors?.title
                  ? "course-title-error"
                  : undefined
              }
            />
            {!dismissed && state?.fieldErrors?.title && (
              <p id="course-title-error" className="text-sm text-destructive">
                {state.fieldErrors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional course description"
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Course"}
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
