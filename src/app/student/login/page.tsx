import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoutButton } from "src/app/logout-button";
import { SignInCard, SignInShell } from "src/components/sign-in-card";
import { LoginEntryState } from "src/lib/auth-service";
import { getAuthService } from "src/lib/auth-singleton";
import { StudentLoginForm } from "./student-login-form";

export const metadata = {
  title: "Student sign in — LMS",
  description: "Sign in with your credentials to access courses and lessons",
};

export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const authService = await getAuthService();
  const entryState = await authService.resolveLoginEntryState(requestHeaders);

  // Already classified — the login form would be a dead end for them.
  // Exhaustive switch (not if/else) so a fifth LoginEntryState added later is
  // a compile error here instead of silently falling through to this form.
  switch (entryState) {
    case LoginEntryState.Admin:
      redirect("/admin/dashboard");
      break;
    case LoginEntryState.Student:
      redirect("/student/dashboard");
      break;
    case LoginEntryState.Unclassified:
    case LoginEntryState.SignedOut:
      break;
    default: {
      const _exhaustive: never = entryState;
      throw new Error(`Unhandled login entry state: ${_exhaustive}`);
    }
  }

  if (entryState === LoginEntryState.Unclassified) {
    return (
      <SignInShell>
        <SignInCard
          title="Account not set up"
          subtitle="This account isn't set up for this school yet."
        >
          <div className="grid justify-center">
            <LogoutButton />
          </div>
        </SignInCard>
      </SignInShell>
    );
  }

  return (
    <SignInShell>
      <StudentLoginForm googleFailed={Boolean((await searchParams).error)} />
    </SignInShell>
  );
}
