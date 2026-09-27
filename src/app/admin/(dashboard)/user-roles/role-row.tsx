"use client";

import { useActionState } from "react";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { CardContent, CardHeader } from "src/components/ui/card";
import { Role } from "src/lib/session";
import { grantAdminAction, revokeAdminAction } from "./actions";

/**
 * One user-roles row: server-rendered name/email (children), role badge and
 * grant/revoke button, plus a refused action's error as a full-width line
 * below. Always offered, even on your own row — the self-demotion guard
 * refuses server-side, and the action's error state must live client-side.
 */
export function RoleRow({
  userId,
  role,
  children,
}: {
  userId: string;
  role: Role;
  children: React.ReactNode;
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
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        {children}
        <div className="flex items-center gap-3">
          <Badge variant={isAdmin ? "default" : "secondary"}>
            {isAdmin ? "Admin" : "Student"}
          </Badge>
          {/* Fixed width: the button's own label never shifts the badge. */}
          <form action={formAction} className="w-32 shrink-0">
            <input type="hidden" name="userId" value={userId} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={isPending}
              className="w-full"
            >
              {label}
            </Button>
          </form>
        </div>
      </CardHeader>
      {state && !state.success && (
        <CardContent>
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        </CardContent>
      )}
    </>
  );
}
