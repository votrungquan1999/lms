"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import {
  getInviteLinkAction,
  type InviteLinkState,
  regenerateInviteLinkAction,
} from "./actions";
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
  const [regenState, regenAction, regenPending] = useActionState<
    InviteLinkState | null,
    FormData
  >(regenerateInviteLinkAction, null);

  // Relative path only — deterministic on server and client, so hydration
  // never mismatches. The absolute URL is built on demand when copying.
  const joinPath = inviteToken ? buildJoinInviteHref(inviteToken) : null;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2 rounded-md border p-3">
      <h2 className="text-sm font-medium">Join Link</h2>

      {joinPath ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
              {joinPath}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}${joinPath}`,
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard write denied/unsupported — button stays "Copy"
                }
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <form action={regenAction}>
            <input type="hidden" name="courseId" value={courseId} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={regenPending}
            >
              {regenPending ? "Regenerating…" : "Regenerate Link"}
            </Button>
          </form>
          {regenState && !regenState.success && (
            <p role="alert" className="text-xs text-destructive">
              {regenState.message}
            </p>
          )}
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
