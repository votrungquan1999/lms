"use client";

import { type ReactNode, useActionState, useState } from "react";
import { ExpectedSchoolField } from "src/components/expected-school-field";
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

/** Opens the New course dialog it sits inside; a page may hold several. */
export function NewCourseButton() {
  return (
    <DialogTrigger asChild>
      <Button>New course</Button>
    </DialogTrigger>
  );
}

/**
 * Client component: dialog for admins to create a new course.
 * @param schoolId - The school this dialog was opened in; posted with the
 *   form so the action can refuse a create from a stale tab.
 * @param children - Content holding the `NewCourseButton`s; the dialog
 *   wraps it so it stays open when a create replaces the button's section.
 */
export function CreateCourseDialog({
  schoolId,
  children,
}: {
  schoolId: string;
  children: ReactNode;
}) {
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
      {children}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>
            Add a course to organize lessons and tests.
          </DialogDescription>
        </DialogHeader>

        <form
          key={successCount}
          action={formAction}
          onSubmit={submitWithoutReset(formAction)}
          className="space-y-4"
        >
          <ExpectedSchoolField schoolId={schoolId} />

          <div className="space-y-2">
            <Label htmlFor="title">Course title</Label>
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
              <p
                id="course-title-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {state.fieldErrors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional course description"
              rows={3}
            />
            <p className="text-sm text-muted-foreground">
              After it is created, open the course to add tests, share its
              invite link and add students.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create course"}
            </Button>
          </div>
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
