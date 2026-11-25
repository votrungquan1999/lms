"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { OrDivider, SignInCard } from "src/components/sign-in-card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { authClient } from "src/lib/auth-client";
import { GoogleSignInButton } from "./google-sign-in-button";

/**
 * Student login form.
 * Calls Better Auth's signIn.email directly from the client,
 * converting the username to our internal email format.
 */
export function StudentLoginForm({
  googleFailed: googleFailedOnLoad = false,
}: {
  googleFailed?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(googleFailedOnLoad);
  const [fieldError, setFieldError] = useState<{
    field: "username" | "password";
    message: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setFieldError(null);
    // Only one error at a time: a new attempt replaces the Google one.
    setGoogleFailed(false);

    const formData = new FormData(event.currentTarget);
    const username = formData.get("username")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    // required blocks a truly empty field in every browser, but not a
    // whitespace-only one — trim() is what actually catches that.
    const usernameBlank = username === "";
    const passwordBlank = password.trim() === "";
    if (usernameBlank && passwordBlank) {
      // Both blank: one message, attached to the username field.
      setFieldError({
        field: "username",
        message: "Enter your username and password",
      });
      setIsLoading(false);
      return;
    }
    if (usernameBlank) {
      setFieldError({ field: "username", message: "Enter your username" });
      setIsLoading(false);
      return;
    }
    if (passwordBlank) {
      setFieldError({ field: "password", message: "Enter your password" });
      setIsLoading(false);
      return;
    }

    const { error: signInError } = await authClient.signIn.email({
      email: `${username}@lms.internal`,
      password,
    });

    if (signInError) {
      setError("Invalid username or password");
      setIsLoading(false);
      return;
    }

    router.push("/student/dashboard");
  }

  return (
    <SignInCard
      title="Student sign in"
      subtitle="Sign in to see your courses and tests."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            disabled={isLoading}
            className="h-11"
            aria-invalid={fieldError?.field === "username" ? "true" : undefined}
            aria-describedby={
              fieldError?.field === "username" ? "username-error" : undefined
            }
          />
          {fieldError?.field === "username" && (
            <p id="username-error" className="text-sm text-destructive">
              {fieldError.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            disabled={isLoading}
            className="h-11"
            aria-invalid={fieldError?.field === "password" ? "true" : undefined}
            aria-describedby={
              fieldError?.field === "password" ? "password-error" : undefined
            }
          />
          {fieldError?.field === "password" && (
            <p id="password-error" className="text-sm text-destructive">
              {fieldError.message}
            </p>
          )}
        </div>

        {error && (
          <p
            className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full" disabled={isLoading}>
          {isLoading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-4 space-y-4">
        <OrDivider />
        {googleFailed && (
          <p className="text-sm text-destructive" role="alert">
            Google sign-in didn&apos;t finish. Please try again.
          </p>
        )}
        <GoogleSignInButton />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Joined with Google? Use Continue with Google.
        <br />
        No account yet? Open your teacher&apos;s invite link.
      </p>
    </SignInCard>
  );
}
