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
import { createPoolAction, type PoolActionState } from "./actions";

/**
 * Client component: dialog for admins to create a new global question pool.
 */
export function CreatePoolDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    PoolActionState | null,
    FormData
  >(createPoolAction, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Pool</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Pool</DialogTitle>
          <DialogDescription>
            Add a question pool to author reusable questions for any test.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Pool Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Algebra basics"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Optional pool description"
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Creating…" : "Create Pool"}
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
