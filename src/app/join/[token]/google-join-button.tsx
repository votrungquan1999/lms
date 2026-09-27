"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import { authClient } from "src/lib/auth-client";

/**
 * Lets a prospective student join using their Google account instead of
 * choosing a password (Step 22). All three callback URLs point back at this
 * same invite page — a first-time signup, a repeat sign-in, and a refusal
 * (Step 23's username collision) all land here, never on `/redirect`, so the
 * caller is never bounced through a page that would act on their
 * half-classified cookie before this page has had a chance to provision it.
 * @param token - The invite token from the URL.
 */
export function GoogleJoinButton({ token }: { token: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      // The ?google=1 marker is the consent signal the invite page's
      // provisioning gate reads (M1) — never a security boundary, just what
      // tells the page apart from a tab restore, back/forward navigation, or
      // a bare URL open that carries the same cookie with no click behind it.
      const joinUrl = `/join/${token}?google=1`;
      await authClient.signIn.social({
        provider: "google",
        callbackURL: joinUrl,
        newUserCallbackURL: joinUrl,
        errorCallbackURL: joinUrl,
      });
    } catch {
      setError("Failed to start sign-in. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={handleSignIn}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? "Redirecting to Google…" : "Continue with Google"}
      </Button>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
