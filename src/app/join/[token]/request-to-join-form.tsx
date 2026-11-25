"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "src/components/ui/button";
import { type RequestToJoinState, requestToJoinAction } from "./actions";
import { JoinStateCard } from "./join-page.ui";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * Client component: lets an EXISTING, signed-in student ask to join a course
 * from its invite link (Step 25) — the recovery path for a self-registration
 * that crashed before its join request was filed (D47). Requires a deliberate
 * click, mirroring the Google button's consent-marker pattern (M1) — opening
 * this page must never write anything on its own.
 * @param token - The invite token from the URL; the server action re-resolves
 * the course from it and never trusts a client-supplied courseId (D41).
 * @param courseTitle - Shown in the heading; display only.
 * @param name - The signed-in student's name; display only.
 * @param username - The signed-in student's username; display only.
 */
export function RequestToJoinForm({
  token,
  courseTitle,
  name,
  username,
}: {
  token: string;
  courseTitle: string;
  name: string;
  username: string;
}) {
  const [state, formAction, isPending] = useActionState<
    RequestToJoinState | null,
    FormData
  >(requestToJoinAction, null);

  if (state?.success) {
    return (
      <section className="w-full max-w-[440px] overflow-hidden rounded-xl border border-success/30 bg-card text-card-foreground shadow-sm">
        {/* Tint over the card, not the grey page, so it reads as light green. */}
        <div className="bg-success/10 p-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success"
            >
              <Check className="size-4" />
            </span>
            <h1 className="text-lg font-bold">Request sent</h1>
          </div>
          <output className="mt-3 block text-sm text-muted-foreground">
            {state.message}
          </output>
          <Button asChild className="mt-4 h-11">
            <Link href="/student/dashboard">Go to my courses</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <JoinStateCard>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
        >
          {initialsOf(name)}
        </span>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{name}</strong> · @
          {username}
        </p>
      </div>
      <h1 className="mt-4 text-xl font-bold">Join {courseTitle}?</h1>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />

        {state && !state.success && (
          <div
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {state.message}
          </div>
        )}

        <Button type="submit" className="h-11 w-full" disabled={isPending}>
          {isPending ? "Requesting…" : "Request to join"}
        </Button>
      </form>
    </JoinStateCard>
  );
}
