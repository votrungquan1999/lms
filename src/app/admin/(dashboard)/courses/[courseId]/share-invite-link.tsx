"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { getInviteLinkAction, type InviteLinkState } from "./actions";
import { buildJoinInviteHref } from "./href";

/**
 * Admin invite-link panel. The displayed token always comes from the
 * server-rendered `inviteToken` prop — every action here calls
 * `revalidatePath`, so Next refreshes this route's data once it resolves,
 * the same mechanism the enrollment/test actions on this page already rely
 * on (see `setEnrollmentsAction`).
 */
export function ShareInviteLink({
  courseId,
  inviteToken,
}: {
  courseId: string;
  inviteToken: string | null;
}) {
  const [getState, getAction, getPending] = useActionState<
    InviteLinkState | null,
    FormData
  >(getInviteLinkAction, null);

  const joinUrl = inviteToken
    ? `${typeof window === "undefined" ? "" : window.location.origin}${buildJoinInviteHref(inviteToken)}`
    : null;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <h2 className="text-sm font-medium">Join Link</h2>

      {joinUrl ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
            {joinUrl}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(joinUrl)}
          >
            Copy
          </Button>
        </div>
      ) : (
        <form action={getAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={getPending}
          >
            {getPending ? "Getting link…" : "Get Join Link"}
          </Button>
        </form>
      )}

      {getState && !getState.success && (
        <p role="alert" className="text-xs text-destructive">
          {getState.message}
        </p>
      )}
    </div>
  );
}
