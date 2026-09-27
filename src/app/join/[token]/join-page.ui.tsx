import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";

/**
 * Shown when the token resolves to a course with a live invite link.
 * @param title - The title of the course the token invites the visitor to join.
 * @param children - The self-signup form, composed in by the server page —
 * this component stays a plain display shell (component-library.md).
 */
export function ValidInviteCard({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardDescription>You&apos;re invited to join</CardDescription>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}

/**
 * Shown for a token that is invalid, revoked, or points at a deleted
 * course. Deliberately the same for all three (D43) — the join page must
 * never become a course-existence oracle.
 */
export function InvalidInviteCard() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Invitation no longer valid</CardTitle>
        <CardDescription>
          This join link is no longer valid. Ask whoever shared it with you for
          a new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        <InviteRecoveryLinks />
      </CardContent>
    </Card>
  );
}

/**
 * The ways forward from a dead invite — shared by the invalid-invite card and
 * both sign-up forms so every dead-invite screen offers the same links.
 */
export function InviteRecoveryLinks() {
  return (
    <>
      <Button asChild>
        <Link href="/student/login">Student sign in</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">Home</Link>
      </Button>
    </>
  );
}
