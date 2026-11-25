import Link from "next/link";
import type { ReactNode } from "react";
import { SignInCard } from "src/components/sign-in-card";
import { Button } from "src/components/ui/button";

/**
 * Shown when the token resolves to a course with a live invite link.
 * @param title - The title of the course the token invites the visitor to join.
 * @param subtitle - Optional line under the title (the sign-up state's prompt).
 * @param children - The self-signup form, composed in by the server page —
 * this component stays a plain display shell (component-library.md).
 */
export function ValidInviteCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <SignInCard
      eyebrow="You're invited to join"
      title={title}
      subtitle={subtitle}
    >
      {children}
    </SignInCard>
  );
}

/**
 * Shown for a token that is invalid, revoked, or points at a deleted
 * course. Deliberately the same for all three (D43) — the join page must
 * never become a course-existence oracle.
 */
export function InvalidInviteCard() {
  return (
    <JoinStateCard>
      <h1 className="text-xl font-bold">Invitation no longer valid</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This join link is no longer valid. Ask whoever shared it with you for a
        new one.
      </p>
      <div className="mt-6 flex gap-3">
        <InviteRecoveryLinks />
      </div>
    </JoinStateCard>
  );
}

/** Plain left-aligned card for the join states that have no logo header. */
export function JoinStateCard({ children }: { children: ReactNode }) {
  return (
    <section className="w-full max-w-[440px] rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      {children}
    </section>
  );
}

/**
 * The ways forward from a dead invite — shared by the invalid-invite card and
 * both sign-up forms so every dead-invite screen offers the same links.
 */
export function InviteRecoveryLinks() {
  return (
    <>
      <Button asChild className="h-11">
        <Link href="/student/login">Student sign in</Link>
      </Button>
      <Button asChild variant="outline" className="h-11">
        <Link href="/">Home</Link>
      </Button>
    </>
  );
}

/** Header link for visitors who already have an account. */
export function HeaderSignInLink() {
  return (
    <Button asChild variant="outline" className="h-10">
      <Link href="/student/login">Sign in</Link>
    </Button>
  );
}
