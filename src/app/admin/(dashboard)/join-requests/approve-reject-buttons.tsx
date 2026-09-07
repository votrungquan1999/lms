"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { approveJoinRequestAction } from "./actions";

/**
 * Approve/reject action for one queue row. Always rendered regardless of the
 * request's current status — same call as `RoleActionButtons`: the server
 * guard is the real boundary, so this surfaces its refusal rather than the
 * UI trying to predict it.
 */
export function ApproveRejectButtons({ requestId }: { requestId: string }) {
  const [approveState, approveAction, isApproving] = useActionState(
    approveJoinRequestAction,
    null,
  );

  return (
    <form action={approveAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" size="sm" disabled={isApproving}>
        {isApproving ? "Approving..." : "Approve"}
      </Button>
      {approveState && !approveState.success && (
        <p role="alert" className="text-xs text-destructive">
          {approveState.message}
        </p>
      )}
    </form>
  );
}
