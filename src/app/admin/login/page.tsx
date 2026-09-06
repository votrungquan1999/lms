import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "src/app/logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { LoginEntryState } from "src/lib/auth-service";
import { getAuthService } from "src/lib/auth-singleton";
import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata = {
  title: "Admin Login — LMS",
  description: "Sign in with your Google account to access the admin dashboard",
};

export default async function AdminLoginPage() {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  const entryState = await authService.resolveLoginEntryState(requestHeaders);

  // Already classified — the login form would be a dead end for them (BUG-4).
  // Exhaustive switch (not if/else) so a fifth LoginEntryState added later is
  // a compile error here instead of silently falling through to this form —
  // for an authenticated caller that would be BUG-4's shape again (F8).
  let isUnclassified: boolean;
  switch (entryState) {
    case LoginEntryState.Admin:
      redirect("/admin/dashboard");
      break;
    case LoginEntryState.Student:
      redirect("/student/dashboard");
      break;
    case LoginEntryState.Unclassified:
      isUnclassified = true;
      break;
    case LoginEntryState.SignedOut:
      isUnclassified = false;
      break;
    default: {
      const _exhaustive: never = entryState;
      throw new Error(`Unhandled login entry state: ${_exhaustive}`);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {isUnclassified ? (
            <>
              <CardTitle className="text-2xl">Account Not Set Up</CardTitle>
              <CardDescription>
                This account isn&apos;t set up for this school yet.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl">Admin Login</CardTitle>
              <CardDescription>
                Sign in with your Google account to manage students and courses.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {isUnclassified ? <LogoutButton /> : <GoogleSignInButton />}
        </CardContent>
      </Card>
    </main>
  );
}
