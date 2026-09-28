"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { addSchoolAdminAction } from "../actions";

/** One account the owner can pick from — not yet an admin of this school. */
export interface SchoolAdminCandidate {
  id: string;
  email: string;
}

/**
 * The owner's form to add an existing account as this school's admin —
 * picks from the same account list `user-roles` shows, filtered to
 * accounts that aren't already a member of this school.
 */
export function AddSchoolAdminForm({
  schoolId,
  candidates,
}: {
  schoolId: string;
  candidates: SchoolAdminCandidate[];
}) {
  const [state, formAction, isPending] = useActionState(
    addSchoolAdminAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="schoolId" value={schoolId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="userId">Account</Label>
        <select
          id="userId"
          name="userId"
          required
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.email}
            </option>
          ))}
        </select>
      </div>
      {state && !state.success && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Adding..." : "Add admin"}
      </Button>
    </form>
  );
}
