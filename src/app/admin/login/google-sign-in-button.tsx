"use client";

import { useState } from "react";
import { Button } from "src/components/ui/button";
import { authClient } from "src/lib/auth-client";

/**
 * Google sign-in button for admin login.
 * Triggers Better Auth social sign-in flow with Google.
 */
export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/admin/dashboard",
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
        size="lg"
        onClick={handleSignIn}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? "Redirecting to Google…" : "Sign in with Google"}
      </Button>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
