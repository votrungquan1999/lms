"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Role } from "src/lib/session";
import { grantAdminAction, revokeAdminAction } from "./actions";

/**
 * Per-row role action for the user-roles page: grants admin on a student
 * row, revokes it on an admin row. Always rendered, even on the caller's
 * own row — the self-demotion guard (D25) refuses server-side and this
 * button surfaces that error, rather than hiding the option in the UI.
 */
export function RoleActionButtons({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) {
  const isAdmin = role === Role.Admin;
  const [state, formAction, isPending] = useActionState(
    isAdmin ? revokeAdminAction : grantAdminAction,
    null,
  );

  const label = isAdmin
    ? isPending
      ? "Revoking..."
      : "Revoke admin"
    : isPending
      ? "Granting..."
      : "Make admin";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {label}
      </Button>
      {state && !state.success && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
