"use client";

import { useState } from "react";
import { GoogleGlyph } from "src/components/sign-in-card";
import { Button } from "src/components/ui/button";
import { authClient } from "src/lib/auth-client";

/**
 * Student Google sign-in. Every callback returns to the student login page,
 * which routes the now-signed-in visitor by role.
 */
export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      const { data } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/student/login",
        newUserCallbackURL: "/student/login",
        errorCallbackURL: "/student/login",
        disableRedirect: true,
      });
      if (!data?.url) {
        throw new Error("Missing Google sign-in address");
      }
      // Set per button, not in the server Google config the teacher login shares.
      const googleUrl = new URL(data.url);
      googleUrl.searchParams.set("prompt", "select_account");
      window.location.assign(googleUrl.toString());
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
        className="h-11 w-full"
      >
        <GoogleGlyph />
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
