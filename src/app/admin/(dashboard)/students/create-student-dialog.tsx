"use client";

import { useActionState, useEffect, useState } from "react";
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
import { useNow } from "src/hooks/use-now";
import { type CreateStudentState, createStudentAction } from "./actions";

const AUTO_CLOSE_MS = 3000;

/**
 * Client component: dialog for admins to create a student account.
 * Uses useActionState to manage form submission + feedback.
 * On success, displays a 3-2-1 countdown and auto-closes the dialog.
 */
export function CreateStudentDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [closeAt, setCloseAt] = useState<number | null>(null);
  const now = useNow();

  const [state, formAction, isPending] = useActionState<
    CreateStudentState | null,
    FormData
  >(async (prevState, formData) => {
    const result = await createStudentAction(prevState, formData);
    if (result.success) {
      setCloseAt(Date.now() + AUTO_CLOSE_MS);
    }
    return result;
  }, null);

  // Derived countdown — no intervals needed
  const remaining = closeAt !== null ? Math.ceil((closeAt - now) / 1000) : null;

  // Auto-close when countdown expires
  useEffect(() => {
    if (remaining !== null && remaining <= 0) {
      setOpen(false);
      setFormKey((k) => k + 1);
      setCloseAt(null);
    }
  }, [remaining]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Student</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Student Account</DialogTitle>
          <DialogDescription>
            Add a new student with username and password credentials.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Alice Nguyen"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              required
              placeholder="e.g. alice"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Student"}
          </Button>
        </form>

        {state?.success && remaining !== null && (
          <output className="block rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
            {state.message} — closing in {remaining}…
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
