"use client";

import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { type JoinSignupState, joinSignupAction } from "./actions";

/**
 * Client component: lets a prospective student create their own account from
 * an invite link (Step 19). Receives only the token — never the course or
 * any other field the action doesn't need — so no extra course data crosses
 * into the RSC payload for this client boundary.
 * @param token - The invite token from the URL; the server action re-resolves
 * the course from it and never trusts a client-supplied courseId (D41).
 */
export function SelfSignupForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<
    JoinSignupState | null,
    FormData
  >(joinSignupAction, null);

  if (state?.success) {
    return (
      <output className="block text-sm text-muted-foreground">
        {state.message}{" "}
        <a href="/student/login" className="underline">
          Sign in
        </a>
        .
      </output>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          required
          autoComplete="username"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
        {isPending ? "Creating account…" : "Create Account"}
      </Button>
    </form>
  );
}
