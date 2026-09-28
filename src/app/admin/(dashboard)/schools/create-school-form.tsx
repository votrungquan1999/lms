"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { createSchoolAction } from "./actions";

/**
 * The owner's form to create a school: a name and a short unique slug.
 * The slug is typed by the owner, never derived from the name.
 */
export function CreateSchoolForm() {
  const [state, formAction, isPending] = useActionState(
    createSchoolAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" required placeholder="acme-school" />
      </div>
      {state && !state.success && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Creating..." : "Create school"}
      </Button>
    </form>
  );
}
