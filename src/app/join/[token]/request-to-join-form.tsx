"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { type RequestToJoinState, requestToJoinAction } from "./actions";

/**
 * Client component: lets an EXISTING, signed-in student ask to join a course
 * from its invite link (Step 25) — the recovery path for a self-registration
 * that crashed before its join request was filed (D47). Requires a deliberate
 * click, mirroring the Google button's consent-marker pattern (M1) — opening
 * this page must never write anything on its own.
 * @param token - The invite token from the URL; the server action re-resolves
 * the course from it and never trusts a client-supplied courseId (D41).
 */
export function RequestToJoinForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<
    RequestToJoinState | null,
    FormData
  >(requestToJoinAction, null);

  if (state?.success) {
    return (
      <output className="block text-sm text-muted-foreground">
        {state.message}
      </output>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state && !state.success && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {state.message}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Requesting…" : "Request to Join"}
      </Button>
    </form>
  );
}
