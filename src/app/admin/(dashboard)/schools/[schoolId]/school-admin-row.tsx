"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { CardContent, CardHeader } from "src/components/ui/card";
import { removeSchoolAdminAction } from "../actions";

/**
 * One school-admin row: server-rendered name/email (children) plus a
 * remove button. The role itself is untouched by removal — only
 * user-roles' revoke takes the role away.
 */
export function SchoolAdminRow({
  schoolId,
  userId,
  children,
}: {
  schoolId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(
    removeSchoolAdminAction,
    null,
  );

  return (
    <>
      <CardHeader className="flex flex-row items-center justify-between">
        {children}
        <form action={formAction}>
          <input type="hidden" name="schoolId" value={schoolId} />
          <input type="hidden" name="userId" value={userId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isPending}
          >
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </form>
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
