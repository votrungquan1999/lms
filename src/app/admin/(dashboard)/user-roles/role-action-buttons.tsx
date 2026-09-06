"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { grantAdminAction } from "./actions";

/**
 * Per-row role action(s) for the user-roles page. Only "make admin" exists
 * so far — a revoke button for existing admins is Step 6's job.
 */
export function RoleActionButtons({ userId }: { userId: string }) {
  const [state, formAction, isPending] = useActionState(grantAdminAction, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Granting..." : "Make admin"}
      </Button>
      {state && !state.success && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </form>
  );
}
