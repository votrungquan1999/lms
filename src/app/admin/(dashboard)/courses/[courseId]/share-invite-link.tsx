"use client";

import { useActionState, useState } from "react";
import { Button } from "src/components/ui/button";
import {
  disableInviteLinkAction,
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
  const [disableState, disableAction, disablePending] = useActionState<
    InviteLinkState | null,
    FormData
  >(disableInviteLinkAction, null);

  // Relative path only — deterministic on server and client, so hydration
  // never mismatches. The absolute URL is built on demand when copying.
  const joinPath = inviteToken ? buildJoinInviteHref(inviteToken) : null;
  const [copied, setCopied] = useState(false);

  return (
    <section
      aria-labelledby="join-link-heading"
      className="space-y-2.5 rounded-xl border bg-card p-4"
    >
      <h2 id="join-link-heading" className="text-[17px] font-semibold">
        Join link
      </h2>

      {joinPath ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted px-2.5 py-2 text-[13px]">
              {joinPath}
            </code>
            <Button
              type="button"
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
            <form action={regenAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={regenPending}
              >
                {regenPending ? "Regenerating…" : "Regenerate link"}
              </Button>
            </form>
            <form action={disableAction}>
              <input type="hidden" name="courseId" value={courseId} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={disablePending}
              >
                {disablePending ? "Turning off…" : "Turn off link"}
              </Button>
            </form>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Anyone with this link can ask to join; you approve each request
            above. Regenerating makes the old link stop working. Turning it off
            keeps everyone already in the course.
          </p>
          {regenState && !regenState.success && (
            <p role="alert" className="text-xs text-destructive">
              {regenState.message}
            </p>
          )}
          {disableState && !disableState.success && (
            <p role="alert" className="text-xs text-destructive">
              {disableState.message}
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
            {getPending ? "Getting link…" : "Get join link"}
          </Button>
        </form>
      )}

      {getState && !getState.success && (
        <p role="alert" className="text-xs text-destructive">
          {getState.message}
        </p>
      )}
    </section>
  );
}
