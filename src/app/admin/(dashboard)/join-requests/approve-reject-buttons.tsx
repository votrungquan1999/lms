"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { approveJoinRequestAction, rejectJoinRequestAction } from "./actions";

/**
 * Approve/reject actions for one queue row. Always rendered regardless of
 * the request's current status — same call as `RoleActionButtons`: the
 * server guard is the real boundary, so this surfaces its refusal rather
 * than the UI trying to predict it.
 */
export function ApproveRejectButtons({ requestId }: { requestId: string }) {
  const [approveState, approveAction, isApproving] = useActionState(
    approveJoinRequestAction,
    null,
  );
  const [rejectState, rejectAction, isRejecting] = useActionState(
    rejectJoinRequestAction,
    null,
  );

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <Button type="submit" size="sm" disabled={isApproving}>
            {isApproving ? "Approving..." : "Approve"}
          </Button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isRejecting}
          >
            {isRejecting ? "Rejecting..." : "Reject"}
          </Button>
        </form>
      </div>
      {approveState && !approveState.success && (
        <p role="alert" className="text-xs text-destructive">
          {approveState.message}
        </p>
      )}
      {rejectState && !rejectState.success && (
        <p role="alert" className="text-xs text-destructive">
          {rejectState.message}
        </p>
      )}
    </div>
  );
}
