"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
  type GoogleUsernameSignupState,
  googleUsernameSignupAction,
} from "./actions";

/**
 * Client component: lets a Google signup whose derived username was taken
 * or invalid choose their own instead of being refused (D49). The caller
 * already holds a valid Google session — this form only ever asks for a
 * username, never a password, since there is no new auth user to create.
 * @param token - The invite token from the URL; the server action
 * re-resolves the course and the caller's identity itself (D41-style — never
 * a client-supplied courseId or authUserId).
 * @param suggestedUsername - A sanitised candidate pre-filled into the
 * field when one exists (empty when the derived local-part sanitised to
 * nothing, e.g. a non-ASCII email).
 */
export function GoogleUsernameForm({
  token,
  suggestedUsername,
}: {
  token: string;
  suggestedUsername: string;
}) {
  const [state, formAction, isPending] = useActionState<
    GoogleUsernameSignupState | null,
    FormData
  >(googleUsernameSignupAction, null);

  if (state?.success) {
    return (
      <output className="block text-sm text-muted-foreground">
        {state.message}{" "}
        <a href="/student/dashboard" className="underline">
          Go to your dashboard
        </a>
        .
      </output>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <p className="text-sm text-muted-foreground">
        Choose a username to finish joining with Google.
      </p>

      <div className="space-y-2">
        <Label htmlFor="google-username">Username</Label>
        <Input
          id="google-username"
          name="username"
          type="text"
          required
          defaultValue={suggestedUsername}
          autoComplete="username"
          disabled={isPending}
        />
      </div>

      {state && !state.success && (
        <div
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {state.message}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Finishing…" : "Finish joining"}
      </Button>
    </form>
  );
}
