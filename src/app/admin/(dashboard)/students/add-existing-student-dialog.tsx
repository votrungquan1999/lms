"use client";

import { useActionState } from "react";
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
import {
  type AddExistingStudentState,
  addExistingStudentAction,
} from "./actions";

/**
 * Client component: dialog for admins to add a student who already has an
 * account, in this or another school, by username.
 * @param schoolId - The school this dialog was opened in; posted with the
 *   form so the action can refuse an add from a stale tab.
 */
export function AddExistingStudentDialog({ schoolId }: { schoolId: string }) {
  const [state, formAction, isPending] = useActionState<
    AddExistingStudentState | null,
    FormData
  >(addExistingStudentAction, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Add existing student</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Existing Student</DialogTitle>
          <DialogDescription>
            Add a student who already has an account, in this or another school,
            by their username.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <ExpectedSchoolField schoolId={schoolId} />
          <div className="space-y-2">
            <Label htmlFor="existing-username">Username</Label>
            <Input
              id="existing-username"
              name="username"
              type="text"
              required
              placeholder="e.g. alice"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Adding…" : "Add student"}
          </Button>
        </form>

        {state?.success && (
          <output className="block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message}
          </output>
        )}
        {state && !state.success && (
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
